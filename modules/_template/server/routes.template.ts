// Domain-Modul-Server — FRAMEWORK-AGNOSTISCH (verbindliches Muster).
//
// Ein Domain-Modul beschreibt seine Routen DEKLARATIV und exportiert REINE Handler-Funktionen, die
// ausschließlich über die im `module.contract.yaml` deklarierten Plattform-Capabilities/Ports arbeiten.
//
// VERBOTEN im Modul:
//   • KEIN Import eines HTTP-/Server-Frameworks (kein `fastify`, kein `express`, kein `http`).
//   • KEIN `declare module "fastify"` / keine Framework-Typen (FastifyRequest/Reply/Instance, Request, Response).
//   • KEIN Start eines eigenen Servers, kein `listen`, kein App-Bootstrap.
//
// Begründung: Das HTTP-/BFF-Framework ist eine PLATTFORM-Sache (App-Factory unter `apps/<app>/server/`), nicht
// die des Moduls. Die App-Factory mountet den Descriptor + die Handler. So bleibt das Modul portabel, testbar
// ohne Server und unabhängig vom konkreten Framework. (Plattform-Routen-Anleitung: .agents/skills/backend-fastify.)

export const domainRoutePrefix = "/api/v1/modules/replace-with-domain-id";

/** Deklarativer Routen-Descriptor (Quelle fürs Mounting durch die App-Factory + OpenAPI). KEINE Framework-Typen. */
export function describeDomainRoutes() {
  return {
    prefix: domainRoutePrefix,
    routes: [
      { method: "GET", path: "/cases", handler: "listCases" },
      { method: "POST", path: "/drafts", handler: "createDraft" },
    ],
  };
}

/**
 * Die Capabilities/Ports, die dieses Modul nutzt — exakt die im `module.contract.yaml` deklarierten (z. B.
 * payment, mailbox, audit, workflow, identity). Generisch typisiert, damit das Modul vom konkreten Provider
 * UND vom Framework entkoppelt bleibt. Die App-Factory injiziert die echten Implementierungen beim Mounten.
 */
export interface DomainPorts {
  readonly [capability: string]: unknown;
}

/** Validierte Eingabe → Ergebnis. REIN: keine HTTP-/Framework-Objekte, voll testbar ohne Server. */
export async function listCases(_input: unknown, _ports: DomainPorts): Promise<{ items: unknown[] }> {
  // Fachlogik über die Ports — deterministisch, ohne HTTP-Details.
  return { items: [] };
}

export async function createDraft(_input: unknown, _ports: DomainPorts): Promise<{ id: string }> {
  // Fachlogik über die Ports — deterministisch, ohne HTTP-Details.
  return { id: "draft-replace-with-domain-id" };
}
