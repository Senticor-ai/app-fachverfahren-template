# `.chos/` — CHOS-Code Warm-Start-Substrat

Dieses Verzeichnis ist die **Brücke zwischen diesem Template und dem CHOS-Code-Generator**
(`packages/journeys` im CHOS-Code-Repo). Es wird mit dem Template geklont und sagt dem
generierenden Agenten, **dass dieses Repo bereits die volle Startbasis ist** und ein
Fachverfahren nur durch das Füllen weniger Delta-Dateien unter `modules/<domain>/` entsteht —
nicht durch Neubau.

## Committete Seed-Dateien (versioniert)

| Datei                                          | Zweck                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`warm-start.md`](./warm-start.md)             | Agenten-/Menschen-Brief: was fertig ist, der 5-Schritt-Weg, die harten Regeln.                                                                                                                                                                            |
| [`build-manifest.json`](./build-manifest.json) | Maschinenlesbare **Delta-Map**: pro Delta-Datei Ziel-Pfad, Vertrag, zu komponierende `public-sector-ui`-Komponenten/Ports, Quelle der Werte und das geerdete Gate. Der CHOS-DAG erzeugt daraus pro Delta EINEN kleinen Knoten mit genau EINEM Datei-Ziel. |
| [`gold-checklist.json`](./gold-checklist.json) | Generische Gold-Qualitäts-Latte, gegen die Template-eigenen Gates gemappt (kein LLM-Judge).                                                                                                                                                               |

Diese Dateien sind **generisch** (Platzhalter `<domain>`). Konkrete Instanz-Annahmen
(z.B. Hundesteuer) liegen in `docs/examples/<instanz>/`.

## Laufzeit-Artefakte (NICHT versioniert)

Wenn CHOS-Code in einem Klon läuft, schreibt es Laufzeit-Artefakte unter `.chos/`
(`provenance.json`, `evidence.jsonl`, `epics/`, `shots/`, `gate.jsonl`, `memory.jsonl`,
`otel.jsonl`, …). Diese sind über `.gitignore` ausgeschlossen — nur die drei Seed-Dateien
oben werden eingecheckt.
