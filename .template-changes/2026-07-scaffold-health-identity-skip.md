---
bump: patch
updateMode: auto
migration: none
---

Identitäts-basierter Selbst-Skip für `scaffold-health` in roh kopierten Konsumenten (Issue #13).

Der bisherige Selbst-Skip in `scripts/test-generated-app-ci.sh` war rein
Datei-Marker-basiert (`.template/lock.json`). Der Marker entsteht nur über die
Scaffold-CLI — Konsumenten, die durch Kopieren des Baums provisioniert wurden
(z.B. der CHOS-Builder via `git clone` + copyTree), tragen ihn nie, sodass die
verschachtelte Scaffold-Harness in deren eigener CI mitlief. Kein Datei-Inhalt
kann "pristine Vorlage" von "roh kopierter Vorlage" unterscheiden; die vom
Runner gesetzte CI-Identität schon.

Neu: Vor dem Marker-Check skippt das Skript, wenn `CI_PROJECT_PATH` (GitLab)
bzw. `GITHUB_REPOSITORY` (GitHub Actions) gesetzt ist und NICHT der kanonischen
Identität der Vorlage entspricht. Lokal (beide unset) bleibt das Verhalten
unverändert. Die Konstanten müssen bei einem Repo-Umzug mitgezogen werden —
`scripts/test-generated-app-ci.guard.test.ts` dupliziert sie absichtlich und
schlägt bei Drift fehl. Zusätzlich dokumentieren README ("Verwendung als
Template") und AGENTS.md ("Template-Lifecycle") den Provisionierungs-Vertrag
explizit: Konsumenten entstehen über `scaffold:domain-app`, Rohkopien sind
nicht unterstützt, `template:adopt` ist der Reparaturpfad.
