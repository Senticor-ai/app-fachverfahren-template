---
name: bausteine-komposition
description: Compose a Fachverfahren MODULARLY from Bausteine (Zuständigkeiten der Ablauforganisation) — each an agent-shaped cell (agents·skills·knowledge·evidence) staffable by human or agent, wired over three typed planes: Koordination (Aktenvermerk/Dossier), Fähigkeit (platform ports), Daten (generic Datenanbindung). Covers how to add a new Zuständigkeit/Baustein and bind its data. Never a hand-wired monolith.
---

# Bausteine-Komposition — das Fachverfahren als Netz aus Zuständigkeiten

Root-Doktrin: `AGENTS.md` (Abschnitt „Fachverfahren als agentic-composable Netz aus Bausteinen"). Dieser Skill sagt, WIE man modular komponiert und eine neue Zuständigkeit hinzufügt — nie als handverdrahteten Monolith.

## Kernbild (normalweltlich)

Ein **Baustein = eine Zuständigkeit der Ablauforganisation** (Bürgerdienst · Fachprüfung · Datenanbindung · Aufsicht · Backend), besetzbar durch **Mensch ODER Agent ODER beide**. Jeder Baustein bündelt **Können · Wissen · Nachweise** (skills · knowledge · evidence). Der Schnitt in Bausteine folgt der **fachlichen Zuständigkeit** — aus dem Fachkonzept (Prozesse / Rollen / `statusMachine`-Übergänge) — nicht technischer Willkür.

## Drei Ebenen (typisierte Verträge zwischen Bausteinen)

- **Koordination** — die gemeinsame **Akte** (Aktenvermerk / Vorgangsakte), die zwischen den Zuständigkeiten läuft; jeder Baustein schreibt seine Beiträge/Entscheidungen hinein, mit Herkunft + Beleg. → Skill `dossier-fallmanagement`.
- **Fähigkeit** — was ein Baustein für andere kann: die Plattform-Ports (`@senticor/platform-contracts`, `src/ports.ts`), governt aufgerufen. KI **nur** über `AiAssistPort` (kein Direkt-LLM, Regel `no-direct-llm`). → Skill `ki-assistenz`.
- **Daten** — die generische **Datenanbindung** (`LeistungConfig.datenanbindung`, `packages/fachverfahren-kit/src/types.ts`): `art` = Register/NOOTS · interne Systeme · externe Dienste; je Eintrag `zweck` (DSGVO-Zweckbindung), `verbindungsklasse` (BSI TR-03190), `normRef` (Rechtsgrundlage). Verallgemeinert das verstreute `register`/`registerRefs`/`fimRefs`/`nachweise` zu EINER Sicht.

## Eine neue Zuständigkeit / einen Baustein hinzufügen

1. **Fachlich schneiden** — welche Zuständigkeit (Rolle / Prozessschritt) fehlt? (Fachkonzept.) Mensch oder Agent besetzt?
2. **In der Naht deklarieren** (`apps/fachverfahren/src/leistung.config.ts`) — die Zuständigkeit als Persona / `statusMachine`-Rolle + ihre Daten als `datenanbindung`-Einträge (Quelle · art · richtung · zweck · verbindungsklasse · normRef). **Keine eigenen Screens** — die Shell rendert aus der Naht.
3. **Fähigkeiten binden** — nötige Ports (`identityAndTrust` / `recordsManagement` / `aiAssist` / …) über die vorhandenen Provider (`provider-*`). Nie ein Direkt-LLM-Import.
4. **Zur Akte beitragen** — der Baustein schreibt Beiträge/Entscheidungen ins Dossier (Koordination) — nachvollziehbar, mit Herkunft + Beleg.
5. **Nachweis führen** — jede Entscheidung/Anbindung mit Rechtsgrundlage + Evidenz. Nie erfinden — offene Punkte als **WISSENSLUECKE** markieren.

## Zonen-Trennung (kein Monolith)

Die Surfaces (Bürger / Sachbearbeitung / Aufsicht) sind **zonen-getrennte Sichten über EINEM Contract** — separat baubar/deploybar, gekoppelt nur über die governte API. Initial einmal koordiniert ableiten, danach je Surface eigenständig weiterentwickeln.

## Nie

- **Kein handverdrahteter Monolith** — der Wert ist die modulare Komposition (Doktrin `AGENTS.md`).
- **Kein Direkt-LLM** — KI ausschließlich über `AiAssistPort` (`no-direct-llm`).
- **Keine erfundenen Werte/Normen/Synonyme** — WISSENSLUECKE statt Erfindung.
