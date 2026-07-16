import type { AttachmentStore, CaseStore } from "@senticor/app-store-contracts";
import { StoreUnavailableError } from "@senticor/app-store-contracts";
import {
  effectivePersonas,
  type AuthStore,
} from "@senticor/app-store-postgres";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "../auth/principal.js";
import { routeAuth } from "../auth/authorization.js";
import { CaseService, CaseServiceError } from "./case-service.js";
import { resolveAppDomainConfig } from "./domain-config.js";

export interface CaseRouteDeps {
  authStore: AuthStore;
  caseStore: CaseStore;
  attachmentStore?: AttachmentStore;
  caseService?: CaseService;
}

function scopeFrom(request: FastifyRequest) {
  const p = request.principal!;
  return {
    tenantId: p.tenantId,
    authorityId: p.authorityId,
    jurisdictionId: p.jurisdictionId,
    actorId: p.actorId,
  };
}

function mapError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof CaseServiceError) {
    const status =
      err.code === "not_found"
        ? 404
        : err.code === "conflict"
          ? 409
          : err.code === "unprocessable"
            ? 422
            : err.code === "unavailable"
              ? 503
              : 400;
    void reply.code(status).send({ error: err.message });
    return true;
  }
  if (err instanceof StoreUnavailableError) {
    void reply.code(503).send({ error: err.message });
    return true;
  }
  return false;
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

function requestId(request: FastifyRequest): string {
  return request.id;
}

async function actorRolle(
  authStore: AuthStore,
  request: FastifyRequest,
  bodyRolle?: unknown,
): Promise<string> {
  // Never trust tenant/actor from body; rolle must match session personas.
  const user = await authStore.getUserById({
    tenantId: request.principal!.tenantId,
    actorId: request.principal!.actorId,
  });
  const personas = user ? effectivePersonas(user) : ([] as string[]);
  if (typeof bodyRolle === "string" && personas.includes(bodyRolle)) {
    return bodyRolle;
  }
  if (personas.includes("sachbearbeitung")) return "sachbearbeitung";
  if (personas.includes("buerger")) return "buerger";
  if (personas.includes("aufsicht")) return "aufsicht";
  return "buerger";
}

export function registerCaseRoutes(
  app: FastifyInstance,
  deps: CaseRouteDeps,
): void {
  const requireSession = routeAuth({ kind: "authenticated" }, deps);
  const service =
    deps.caseService ??
    new CaseService({
      caseStore: deps.caseStore,
      ...(deps.attachmentStore
        ? { attachmentStore: deps.attachmentStore }
        : {}),
      resolveConfig: resolveAppDomainConfig,
    });

  app.get("/api/v1/cases", { ...requireSession }, async (request, reply) => {
    try {
      const q = request.query as {
        state?: string | string[];
        search?: string;
        cursor?: string;
        limit?: string;
      };
      const states = q.state
        ? Array.isArray(q.state)
          ? q.state
          : [q.state]
        : undefined;
      const items = await service.list(scopeFrom(request), {
        ...(states ? { states } : {}),
        ...(q.search ? { search: q.search } : {}),
        ...(q.cursor ? { cursor: q.cursor } : {}),
        ...(q.limit ? { limit: Number(q.limit) } : {}),
      });
      return reply.send({ items });
    } catch (err) {
      if (mapError(reply, err)) return;
      throw err;
    }
  });

  app.get(
    "/api/v1/cases/:caseId",
    { ...requireSession },
    async (request, reply) => {
      try {
        const { caseId } = request.params as { caseId: string };
        const item = await service.get(scopeFrom(request), caseId);
        if (!item) {
          return reply.code(404).send({ error: "Fall nicht gefunden" });
        }
        return reply.send(item);
      } catch (err) {
        if (mapError(reply, err)) return;
        throw err;
      }
    },
  );

  app.post("/api/v1/cases", { ...requireSession }, async (request, reply) => {
    try {
      const body = request.body as {
        leistungId?: string;
        antragsdaten?: Record<string, unknown>;
        attachmentIds?: string[];
        rolle?: string;
      };
      const key = idempotencyKey(request);
      if (!key) {
        return reply
          .code(400)
          .send({ error: "Idempotency-Key header is required" });
      }
      if (!body.antragsdaten || typeof body.antragsdaten !== "object") {
        return reply.code(400).send({ error: "antragsdaten required" });
      }
      // Reject client-supplied tenant/actor fields if present
      if (
        "tenantId" in (body as object) ||
        "actorId" in (body as object) ||
        "authorityId" in (body as object)
      ) {
        return reply
          .code(400)
          .send({ error: "tenant/actor fields must not be sent in body" });
      }
      const created = await service.einreichen({
        scope: scopeFrom(request),
        actor: {
          actorId: request.principal!.actorId,
          rolle: await actorRolle(deps.authStore, request, body.rolle),
        },
        leistungId: body.leistungId ?? "musterantrag",
        antragsdaten: body.antragsdaten,
        ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
        idempotencyKey: key,
        requestId: requestId(request),
      });
      return reply.code(201).send(created);
    } catch (err) {
      if (mapError(reply, err)) return;
      throw err;
    }
  });

  app.post(
    "/api/v1/cases/:caseId/transitions",
    { ...requireSession },
    async (request, reply) => {
      try {
        const { caseId } = request.params as { caseId: string };
        const body = request.body as {
          eventName?: string;
          detail?: string;
          expectedVersion?: number;
          rolle?: string;
          /** Rejected — server owns actor. */
          actorId?: string;
          to?: string;
        };
        const key = idempotencyKey(request);
        if (!key) {
          return reply
            .code(400)
            .send({ error: "Idempotency-Key header is required" });
        }
        if (body.actorId !== undefined) {
          return reply
            .code(400)
            .send({ error: "actorId must not be sent in body" });
        }
        if (typeof body.expectedVersion !== "number") {
          return reply.code(400).send({ error: "expectedVersion required" });
        }
        const eventName = body.eventName ?? body.to;
        if (!eventName) {
          return reply.code(400).send({ error: "eventName required" });
        }
        const updated = await service.uebergang({
          scope: scopeFrom(request),
          actor: {
            actorId: request.principal!.actorId,
            rolle: await actorRolle(deps.authStore, request, body.rolle),
          },
          caseId,
          eventName,
          ...(body.detail !== undefined ? { detail: body.detail } : {}),
          expectedVersion: body.expectedVersion,
          idempotencyKey: key,
          requestId: requestId(request),
        });
        return reply.send(updated);
      } catch (err) {
        if (mapError(reply, err)) return;
        throw err;
      }
    },
  );
}
