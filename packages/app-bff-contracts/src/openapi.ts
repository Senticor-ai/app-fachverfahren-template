// openapi — Metadaten des intern ausgelieferten OpenAPI-Dokuments
// (GET /internal/openapi.json, Issue #11 Phase E). Nur BFF-Routen mit diesen Tags
// erscheinen im Dokument (hideUntagged) — App-lokale Routen bleiben unsichtbar.
export const openApiInfo = {
  title: "App-BFF-API",
  version: "1.0.0",
  description:
    "Fachliche BFF-Endpunkte der App-Runtime: Sitzung, Capabilities, " +
    "Benutzereinstellungen und Postfach. Autorisierung über SDK-RBAC-Permissions " +
    "(deny-by-default), Fehler im einheitlichen Envelope { error, requestId? }.",
} as const;

export const openApiTags = [
  { name: "session", description: "Sitzung und aufgelöste Berechtigungen" },
  { name: "preferences", description: "Benutzereinstellungen (eigenes Konto)" },
  { name: "mailbox", description: "Postfach (eigenes bzw. behördliches)" },
  {
    name: "buerger",
    description:
      "Bürger-Sicht auf die EIGENEN Anträge (Eigentümerschaft ausschliesslich aus der Sitzung)",
  },
] as const;
