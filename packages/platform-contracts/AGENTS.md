# Platform Contracts Instructions

Diese Regeln gelten zusätzlich zu `../../AGENTS.md`.

- Dieses Paket definiert öffentliche Capability-Ports und importiert niemals
  Domain-Module.
- Neue oder geänderte Capabilities müssen in `platform/capabilities.json` und
  `docs/capabilities/` dokumentiert werden.
- Contract-Tests bleiben package-lokal und dürfen keine Provider-Implementierung
  voraussetzen.
