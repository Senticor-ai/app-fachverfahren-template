// session — DTOs für GET /api/session und GET /api/capabilities: die SDK-RBAC-Sicht
// auf die aufgelöste Sitzung (Rollen citizen/caseworker + Domain-Permissions).
// Abgrenzung: /auth/session bleibt die App-spezifische Workspace-Sicht.
import { Type, type Static } from "@sinclair/typebox";

export const SessionDtoSchema = Type.Object(
  {
    actorId: Type.String({ minLength: 1 }),
    tenantId: Type.String({ minLength: 1 }),
    authorityId: Type.String({ minLength: 1 }),
    jurisdictionId: Type.String({ minLength: 1 }),
    rbacRoles: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type SessionDto = Static<typeof SessionDtoSchema>;

export const CapabilitiesDtoSchema = Type.Object(
  {
    rbacRoles: Type.Array(Type.String({ minLength: 1 })),
    permissions: Type.Array(Type.String({ minLength: 1 })),
    /** WELCHER KI-ANBIETER TATSÄCHLICH VERDRAHTET IST — `local-fake` heißt: es antwortet KEIN Modell,
     *  sondern ein deterministischer Echo. Die Oberfläche sagt das dann auch. Vorher gab sich der Fake
     *  als „ollama:qwen3" aus: in Akten und Sichten stand eine Modell-Kennung, hinter der nie ein
     *  Modell stand — ein Aktenvermerk sah aus wie eine KI-Einschätzung und war eine Echo-Antwort. */
    kiAnbieter: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type CapabilitiesDto = Static<typeof CapabilitiesDtoSchema>;
