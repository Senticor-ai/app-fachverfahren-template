---
bump: minor
updateMode: review
migration: none
---

Macht `scaffold:domain-app` gesund und schützt das per PR-Builder/CI/precommit-Gate.

Behebt vier Ursachen, warum eine frisch gescaffoldete App rot pushte, während die
Vorlage grün blieb: (1) Textersetzung erfasste `.mts`/`.env.example`/`.husky`-Hooks
und Ignore-Dateien nicht (stale `apps/fachverfahren`-Pfade); (2) das Rendering war
auf `fachverfahren` als Quell-App festgenagelt — jetzt erkennt es die Basis-Domain
aus `.template/answers.json`, sodass ein generiertes App sich selbst re-scaffolden
kann; (3) Domain-Ersetzung verschob Zeilenlängen und brach `format:check` — die
umgeschriebenen Dateien werden nun deterministisch mit Prettier nachformatiert;
(4) die generische Engine unter `tooling/template/` wird VERBATIM kopiert statt sich
selbst zu ersetzen (aus `["fachverfahren-template", domain]` wurde sonst eine nackte
Regel, die TS-Identifier zerbrach).

Neu: `scripts/test-generated-app-ci.sh` (scaffoldet + fährt in der App deren eigenes
`ci-validate.sh` per `CI_PROFILE=core|full`, plus Residue-/No-Mutation-Checks und
Runtime-Smoke), `scripts/smoke-generated-app.sh`, `CI_PROFILE` in `ci-validate.sh`,
Renderer-Contract-Tests, GitHub-`scaffold-health`- und `scaffold-nightly`-Jobs, GitLab
`scaffold-health`/`scaffold-nightly`, sowie ein pre-push-Gate. Self-Skip in Konsumenten
über `.template/lock.json`.
