// Neutral-Example — die KOMPILIERENDE Referenz für einen Domain-Modul-Server. FRAMEWORK-AGNOSTISCH:
// deklarativer Routen-Descriptor + REINE Handler über Ports. KEIN fastify/express, kein `declare module`,
// kein eigener Server. Die App-Factory (apps/<app>/server/) mountet das. Muster: modules/_template/server/.

export const neutralExampleRoutePrefix = "/api/v1/modules/neutral-example";

export function describeNeutralExampleRoutes() {
  return {
    prefix: neutralExampleRoutePrefix,
    routes: [
      { method: "GET", path: "/cases", handler: "listCases" },
      { method: "POST", path: "/drafts", handler: "createDraft" },
    ],
  };
}

/** Im module.contract.yaml deklarierte Capabilities/Ports — generisch, provider-/framework-entkoppelt. */
export interface NeutralExamplePorts {
  readonly [capability: string]: unknown;
}

/** Reine Handler — validierte Eingabe + Ports → Ergebnis. Keine HTTP-/Framework-Objekte, testbar ohne Server. */
export async function listCases(_input: unknown, _ports: NeutralExamplePorts): Promise<{ items: unknown[] }> {
  return { items: [] };
}

export async function createDraft(_input: unknown, _ports: NeutralExamplePorts): Promise<{ id: string }> {
  return { id: "draft-neutral-example" };
}
