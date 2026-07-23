// chos-wissen-store — der WissenStore-Adapter auf den chos-Graph-Store. Das war die von Anfang an benannte
// PROD-Ziel-Implementierung (s. wissen-store.ts Kopf: „chos injiziert seinen Adapter über die DI-Naht").
// Verfahrens-Wissen ist append-only + scoped + chronologisch → 1:1 das Ereignis-Log-Primitiv des ChosClient
// (Stream-Key = authority:procedure:version, `tenantId` = chos-Partition). Kein Route-/UI-Wechsel: derselbe
// WissenStore-Vertrag wie InMemory/Postgres.

import { type ChosClient } from "./chos-client.js";
import {
  type VerfahrensWissenEintrag,
  type WissenQuery,
  type WissenStore,
} from "./wissen-store.js";

/** Der Wissens-Stream EINES Verfahrens (behörden- + verfahrens-scoped) — reproduziert exakt das InMemory-/
 *  Postgres-Filterprädikat (tenantId trägt die chos-Partition, der Rest den Stream). */
function wissenStream(scope: {
  authorityId: string;
  procedureId: string;
  procedureVersion: string;
}): string {
  return `${scope.authorityId}:${scope.procedureId}:${scope.procedureVersion}`;
}

function eintragToBody(e: VerfahrensWissenEintrag): Record<string, unknown> {
  return { ...e, metadaten: { ...e.metadaten } };
}

function bodyToEintrag(body: Record<string, unknown>): VerfahrensWissenEintrag {
  return {
    eintragId: String(body["eintragId"]),
    procedureId: String(body["procedureId"]),
    procedureVersion: String(body["procedureVersion"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    actorId: String(body["actorId"]),
    art: String(body["art"]),
    urheber: String(body["urheber"]),
    text: String(body["text"]),
    metadaten:
      body["metadaten"] && typeof body["metadaten"] === "object"
        ? (body["metadaten"] as Record<string, unknown>)
        : {},
    occurredAt: String(body["occurredAt"]),
  };
}

export class ChosWissenStore implements WissenStore {
  constructor(private readonly client: ChosClient) {}

  async appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag> {
    await this.client.appendEvent({
      tenantId: eintrag.tenantId,
      stream: wissenStream(eintrag),
      id: eintrag.eintragId,
      occurredAt: eintrag.occurredAt,
      body: eintragToBody(eintrag),
    });
    return { ...eintrag, metadaten: { ...eintrag.metadaten } };
  }

  async listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]> {
    const events = await this.client.listEvents({
      tenantId: query.tenantId,
      stream: wissenStream(query),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return events.map((e) => bodyToEintrag(e.body));
  }

  async ping(): Promise<void> {
    await this.client.ping?.();
  }
}
