---
bump: minor
updateMode: review
migration: none
---

# Governance-Opt-in (MONOTON) — additiver Kern (Dual-Mode Phase 2a)

Additiver, verhaltensneutraler Kern des monotonen Governance-Opt-ins. Ermöglicht einem
Verfahren, über die in `statusMachine.transitions` deklarierte Vier-Augen-Menge hinaus
Governance zu VERSCHÄRFEN — strikt monoton (nur ANschalten, nie ab).

Neu in `LeistungConfig`:
```ts
governance?: { zusaetzlicheVierAugen?: { from: string; to: string }[] };
```
Optional/additiv — fehlt es, verhält sich alles byte-identisch wie bisher.

Neue reine Interpreter-Funktionen (aus `@senticor/fachverfahren-kit`):
- `abgeleiteteTransitions(config)` — die EFFEKTIVEN Transitionen: jede in `zusaetzlicheVierAugen`
  genannte (from→to) trägt zusätzlich `vierAugen: true`; alle anderen unverändert. Ohne
  `governance` wird die deklarierte Liste UNVERÄNDERT (per Referenz) zurückgegeben. Rein,
  immutabel, idempotent — DEV-Store und PROD-Policy können dieselbe EINE Wahrheit ableiten
  (keine zweite präzedenzlose Governance-Quelle).
- `governanceMonotonieVerletzungen(config)` — positive Monotonie-Assertion: liefert die
  deklarierten Vier-Augen-Transitionen, die in der abgeleiteten Menge NICHT mehr gate-pflichtig
  sind (leer = ok). Verriegelt, dass die Ableitung Governance nur verstärkt, nie abschwächt.

**Phase 2b (jetzt enthalten): DEV-Store verdrahtet.** `createFachverfahrenStore` löst ALLE
Übergänge (`transitionsFrom` + `uebergang`) aus einer EFFEKTIVEN State-Machine auf
(`{ ...statusMachine, transitions: abgeleiteteTransitions(config) }`), statt aus `config.statusMachine`
direkt. Ein `governance`-Opt-in verschärft damit die Vier-Augen-Prüfung im Store real (End-to-End-
Test: ein normal ungatterter Übergang verlangt mit Opt-in zwei verschiedene Akteure). HEUTE byte-
identisch — keine Config nutzt `governance`, `abgeleiteteTransitions` liefert die deklarierte Liste
per Referenz, der Contract bleibt frisch.

**Noch offen** (folgt, mit voller Verifikation): (1) die PROD-Policy (`DefaultDenyPolicyEngine`)
ebenfalls auf `abgeleiteteTransitions` beziehen — sie löst Vier-Augen heute über einen anderen Pfad
auf (nicht direkt aus `statusMachine.transitions`); vor produktiver Nutzung eines `governance`-Opt-ins
schließen. (2) Die effektive Vier-Augen-Menge in den `leistung.contract.json`-Snapshot aufnehmen
(auditierbar). Die Opt-in-Fähigkeiten `buergerPortal`/`bescheid`/`gebuehr` kommen erst, wenn ihre
Capabilities verdrahtet werden (YAGNI).
