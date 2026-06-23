export const messages = {
  "app.skipToMain": "Zum Hauptinhalt springen",
  "nav.citizen": "Bürgerportal",
  "nav.caseworker": "Fachverfahren",
  "nav.evidence": "Nachweise",
  "nav.payments": "Zahlungen",
  "nav.mailbox": "Postfach",
  "nav.compliance": "Evidence",
} as const;

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey): string {
  return messages[key];
}
