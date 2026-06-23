# Security Policy

Dieses Repository ist eine Plattformvorlage fuer Verwaltungsanwendungen.
Sicherheitsrelevante Aenderungen muessen besonders vorsichtig erfolgen.

## Grundsaetze

- Keine Access- oder Refresh-Tokens im Browser Storage.
- Autorisierung findet serverseitig statt.
- Fachliche Audit-Events sind append-only und getrennt von technischen Logs.
- Secrets und interne Upstreams duerfen nicht in `/runtime-config.json`.
- Provider-Bindings muessen klassifiziert und ueber Service-Bindings modelliert
  werden.
- Migrationen laufen ueber kontrollierte Jobs, nicht automatisch aus jeder
  Replica.

## Melden

Bitte Sicherheitsprobleme nicht in oeffentlichen Issues mit Exploit-Details
melden. Nutze den projektspezifischen vertraulichen Meldeweg, sobald das
Repository auf openCode veroeffentlicht ist.
