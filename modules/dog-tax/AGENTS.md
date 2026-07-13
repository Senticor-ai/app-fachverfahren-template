# Hundesteuer Modul

Dieses Modul unterliegt zusätzlich zu den Root-Regeln diesem Vertrag:

- Fachlogik bleibt in diesem Modul.
- Plattformfähigkeiten werden über deklarierte Capabilities genutzt.
- Regeln dürfen Root-Policy nur verschärfen, nie lockern.
- `module.contract.yaml` ist die maschinenlesbare Grenze für Agenten.
