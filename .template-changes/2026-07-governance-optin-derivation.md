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

**Phase 2c/2d (jetzt enthalten): PROD-Pfad + Contract.** Die PROD-Policy löst ihre Vier-Augen-Pflicht
NICHT direkt aus der Config, sondern aus dem committeten `leistung.contract.json` (der Server baut
seinen `ProcedureCatalog` via `catalogFromStatusMachines` aus `contract.statusMachine.transitions`).
Daher genügt EINE Naht: der Contract-Snapshot wird jetzt aus der EFFEKTIVEN Config gebildet
(`toContractSnapshot(effektiveLeistungConfig(config))` in `emit-contract` UND `check-leistung-contract`).
So trägt der Contract die governance-monoton abgeleitete Vier-Augen-Menge → DEV-Store und PROD-Policy
sehen dieselbe eine Wahrheit. HEUTE byte-identisch (musterantrag ohne `governance`).

Damit die strip-types-Contract-Gates das laden können, liegt die Derivation SELF-CONTAINED (nur
type-only Imports) in `lib/governance.ts` (aus `interpreter` weiterhin re-exportiert; öffentliche API
unverändert). Neu: `effektiveLeistungConfig(config)` — projiziert die Config auf ihre effektive Gestalt
(gibt bei fehlendem `governance` DIESELBE Referenz zurück → byte-identisch).

**Noch offen:** die Opt-in-Fähigkeiten `buergerPortal`/`bescheid`/`gebuehr` kommen erst, wenn ihre
Capabilities verdrahtet werden (YAGNI). Automations-Engine-Vier-Augen (`fordertVierAugen`) liest aus
demselben Katalog — bei Bedarf gegenprüfen.
