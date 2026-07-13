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

**Bewusst NOCH NICHT enthalten** (folgt supervised, mit voller Verifikation): das Verdrahten von
`store.ts`/PROD-Policy auf `abgeleiteteTransitions` (der Verhaltenswechsel) und die Aufnahme der
effektiven Vier-Augen-Menge in den `leistung.contract.json`-Snapshot. Bis dahin ist dieser Kern
inert (keine Config nutzt `governance`, der Contract bleibt frisch/byte-identisch). Die
Opt-in-Fähigkeiten `buergerPortal`/`bescheid`/`gebuehr` kommen erst, wenn ihre Capabilities
verdrahtet werden (YAGNI). Contract-Paritätstest + Reinheits-/Idempotenz-Test decken den Kern ab.
