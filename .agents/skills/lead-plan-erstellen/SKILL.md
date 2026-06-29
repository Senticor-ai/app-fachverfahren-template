# Lead-Plan erstellen (.chos/plan.json)

Nutze diese Anleitung in der **intake-Phase**, nachdem du den Bau-Auftrag + die Domäne verstanden hast.
Du bist der **planende Lead-Spine-Agent**: du antizipierst — wie ein Mensch, der plant — je Phase das erwartete
Ergebnis und schreibst den **Spine-DAG als `.chos/plan.json`**. Diese Antizipation IST der Vertrag, gegen den
der Spine deterministisch prüft (erreicht == antizipiert → GRÜN; verfehlt → ROT, das System repariert).

## Leitplanke (nicht verhandelbar)
- **governance.yaml ist der bindende Boden.** Dein Plan PRÄZISIERT nur Weg + erwartete Ergebnisse — er entfernt
  KEINE Vorgabe und erfindet KEINE neue Phase. Knoten-`id` MUSS einer governance-Phase entsprechen.
- **Antizipation billig halten** (ein think→convert-Schritt): kurze, domänen-scharfe Vorhersage — KEIN voller Simulator.
- **`konfidenz` ist nur Priorisierung, NIE ein Gate.** Die harte Prüfung läuft über `post`-Predicates + `produces`.

## Was du schreibst: `.chos/plan.json`
```jsonc
{
  "planId": "plan-<projektname>",
  "version": 1,
  "intent": { "domain": "<kebab>", "leistung": "<Klartext>", "buildType": "<prototyp|mvp|produktiv>", "track": "<track>" },
  "phases": [
    {
      "id": "fachkonzept",                      // MUSS eine governance-Phase sein
      "dependsOn": ["kontext"],                 // DAG-Kante → Parallelisierung (toWaves); nur ergänzen, nie unter governance lockern
      "ziel": "Vollständiges Fachkonzept mit Wenn-Dann-Regellogik je Norm für <Leistung>",
      "antizipiertesErgebnis": {                // dein menschlicher Plan: was kommt heraus (domänen-scharf)
        "form": "Markdown + Mermaid je Entscheidungspfad",
        "umfang": { "kapitel": 12, "regeln": ">=8", "normen": ">=4" },
        "inhaltspunkte": ["<die konkreten Normen/Tatbestände DIESES Verfahrens, z.B. GewO §14 + GewAnzV>"]
      },
      "post": ["regellogik-wenn-dann-mit-norm", "fachkonzept-vollstaendig"],  // Erfolgs-Kriterien aus governance.yaml dieser Phase
      "produces": [".chos/fachkonzept.json", "docs/fachkonzept.md"],
      "risiken": [{ "id": "quelle-flach", "beschreibung": "Regeln narrativ statt strukturiert", "mitigation": "regellogik-wenn-dann-mit-norm hart prüfen" }],
      "konfidenz": 0.65
    }
    // … je aktive Phase des Bau-Modus ein Knoten
  ]
}
```

## Schritte
1. **Intent + Domäne** aus dem Auftrag bestimmen (was/für wen/nach welchem Recht), in `intent` schreiben.
2. **Phasen des Bau-Modus** aus `governance.yaml` lesen (`phases[].id`, `dependsOn`, `success`, `produces`) — das ist der Boden.
3. **Je Phase antizipieren** (domänen-scharf, nicht generisch): `ziel` + `antizipiertesErgebnis` (Form/Umfang/echte Inhaltspunkte DIESES Verfahrens). Für Recherche-Phasen: welche Normen/Register/Steckbriefe sind zu erwarten.
4. **`post`** = die deterministisch prüfbaren `success`-Kriterien der Phase (aus governance.yaml übernehmen); **`produces`** = die Datei-Zusagen. So prüft der Spine deterministisch gegen deine Antizipation.
5. **`dependsOn`** setzen, wo Phasen unabhängig sind → der Spine parallelisiert sie (Wellen). Nie eine governance-Abhängigkeit weglassen.
6. **`.chos/plan.json` schreiben** (write-Tool). Der governte Build lädt + wendet ihn automatisch an (applyPlanToPhases, governance-Boden bleibt). Bei früheren ähnlichen Läufen: recall (memory) nutzen, um die Antizipation zu schärfen.

## Regeln
- Knoten-`id` ∉ governance-Phasen → wird ignoriert (kein Effekt). Halte dich an die echten Phasen-IDs.
- `post` nur mit IDs, die governance.yaml als `success`/contractGate führt (sonst sind sie weiche, nicht-blockende Critics).
- Idempotent: ein erneuter Plan (höhere `version`) ersetzt den alten; der Spine vergleicht weiter deterministisch.
