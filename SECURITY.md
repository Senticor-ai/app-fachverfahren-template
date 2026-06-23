# Security Policy

Dieses Repository ist eine Plattformvorlage für Verwaltungsanwendungen.
Sicherheitsrelevante Änderungen müssen besonders vorsichtig erfolgen.

## Grundsätze

- Keine Access- oder Refresh-Tokens im Browser Storage.
- Autorisierung findet serverseitig statt.
- Fachliche Audit-Events sind append-only und getrennt von technischen Logs.
- Secrets und interne Upstreams dürfen nicht in `/runtime-config.json`.
- Provider-Bindings müssen klassifiziert und über Service-Bindings modelliert
  werden.
- Migrationen laufen über kontrollierte Jobs, nicht automatisch aus jeder
  Replica.

## Melden

Bitte Sicherheitsprobleme nicht in öffentlichen Issues mit Exploit-Details
melden. Nutze den projektspezifischen vertraulichen Meldeweg, sobald das
Repository auf openCode veröffentlicht ist.
