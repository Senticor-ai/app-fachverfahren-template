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
melden. Sende vertrauliche Meldungen an
[security@senticor.ai](mailto:security@senticor.ai) und beschreibe betroffene
Komponenten, Reproduktionsschritte, mögliche Auswirkungen und bekannte
Workarounds.

Wir bestätigen den Eingang so schnell wie möglich und stimmen Offenlegung,
Korrektur und Veröffentlichung mit der meldenden Person ab. Bitte veröffentliche
Details erst nach Abstimmung mit den Maintainer:innen.
