# Archiv

Hier liegen Dokumente, die **nicht mehr gelten**. Sie werden **verschoben, nie
gelöscht** — unter `<datum>/<ursprünglicher Pfad>`, damit die Herkunft lesbar
bleibt. Jede Zeile unten nennt drei Dinge: den ursprünglichen Pfad, **warum**
das Dokument veraltet ist, und **wer es ersetzt**. Jede archivierte Datei trägt
zusätzlich in Zeile 1 eine Archiv-Plakette — das Doku-Wiki (`/hilfe`) rendert
`docs/**` rekursiv und würde sie sonst wie geltende Doku zeigen.

Ein archiviertes Dokument wird **nicht** gepflegt. Wer seinen Inhalt braucht,
liest den Nachfolger.

## 2026-09-11

| Ursprünglicher Pfad                                 | Warum veraltet                                                                                                                                                                                                             | Nachfolger                                                                                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/planning/PLAN-COMPOSABLE-FAEHIGKEITEN-KIT.md` | Ein **fertiger** Plan im Ordner „offene Arbeit": das Dokument sagt selbst „STAND: S6 ist umgesetzt (Commit `a8e8420`)"; sein Gesamtplan liegt zudem in einem anderen Repository.                                           | Die Implementierung selbst mit ihren Zeugen `packages/public-sector-sdk/src/composable-faehigkeiten-quelle.test.ts` und `packages/app-bff-fastify/src/routes/composables-faehigkeiten-naht.test.ts`.                          |
| `docs/reference/chos-code-integration.md`           | Ein datierter Vorfallbericht („Why your pipelines are red right now") an **eine benannte Fabrik** — in einem Vertrags-Ordner, der vendor-neutral bleibt. Seine einzige dauerhafte Regel stand doppelt.                     | [`../reference/governed-build-contract.md`](../reference/governed-build-contract.md) — die Regel „Build-Scratch nie unter `modules/`" ist dort vendor-neutral übernommen; der Modul-Pfad selbst steht in `modules/README.md`. |
| `docs/contributing/agent-configuration.md`          | Wiederholt `docs/agents/bootstrap.md` und `AGENTS.md` — und tut es mit falschen Zahlen: es nennt vier Skill-Themen, während `.agents/skills/` neunzehn trägt, und nennt die Skills „bewusst kurz" bei 415 bzw. 281 Zeilen. | [`../agents/bootstrap.md`](../agents/bootstrap.md) + [`../../AGENTS.md`](../../AGENTS.md). Inhaltlich war nichts zu übernehmen.                                                                                               |
