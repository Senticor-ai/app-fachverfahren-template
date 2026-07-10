# What the template needs from chos-code (and any external app generator)

> Audience: the chos-code / opencode build team. This is the contract an
> externally-generated Fachverfahren app must satisfy so its CI on
> `gitlab.opencode.de` stays green. It complements — does not replace — the
> canonical rules in `AGENTS.md` and the `fachverfahren-app` skill.

## Why your pipelines are red right now

Every phase commit (`chos-phase: …`) runs the template's full gate
(`scripts/ci-validate.sh` → `precommit:check`). The failing check is
`check:domain-contracts`. Example (job on `hundesteuer-munchen-akhb34`):

```
Error: ENOENT: no such file or directory, scandir '.../modules/hundesteuer/contracts'
    at checkScreenContracts (scripts/check-domain-contracts.mjs:115)
```

Cause: the `kontext` phase writes domain knowledge into `modules/<domain>/`
(e.g. `modules/hundesteuer/compliance-regeln`, `.../korpus-bindung`). The gate
treats **every** directory under `modules/` as a _complete domain module_ and
requires the full contract set — so a partial/scratch directory fails the build.

> The template now reports this as a clean, actionable list instead of a Node
> stack trace, but **the build still fails** — because the directory genuinely
> isn't a valid module. The fix is on the generator side, below.

## The one rule: build through the single seam

A Fachverfahren in this template is authored by writing exactly one file:

```
apps/fachverfahren/src/leistung.config.ts   # the LeistungConfig — the ONLY seam
```

The running app renders entirely from this config (Bürger / Amt / Aufsicht
routes). Do **not** create `modules/<domain>/` to build a Fachverfahren:
`modules/` is a PLAN-only path — the app does not mount it, nothing there is
rendered, and it is held to a strict module contract. See `modules/README.md`.

## Concrete asks

1. **Author `apps/fachverfahren/src/leistung.config.ts`, not `modules/<domain>/`.**
   Follow the `fachverfahren-app` skill / `AGENTS.md` ("DIE EINE Austausch-Naht").
   Put domain values (tariffs, deadlines, thresholds) as data in the config.

2. **Keep grounding/scratch out of gated paths.** `.chos/`, `korpus-bindung`,
   `compliance-regeln` and similar phase artifacts must live under `.chos/` or
   `docs/domain/` — **never anywhere under `modules/`**. There is no CI-safe
   scratch location inside `modules/`: `check:domain-contracts` validates every
   non-`_` directory as a full module, and `check:module-contracts` validates
   **every** directory (including `_`-prefixed ones) and flags a missing
   `module.contract.yaml`. Give files real extensions (`.md`), not bare names.

3. **Gate each phase before pushing to `main`.** After each `chos-phase`, run:

   ```bash
   # fast, catches the modules/ problem
   pnpm run check:domain-contracts
   # or the fuller domain gate:
   pnpm run check:agent-domain
   ```

   Don't push a phase commit that fails the gate. Alternatively, run phases on a
   branch and fast-forward `main` only when green — that keeps `main` (and the
   deploy pipeline) green throughout the build.

4. **If you genuinely intend a formal module**, generate it — don't hand-write it:

   ```bash
   pnpm run app:new -- --spec <app.spec.yaml>
   ```

   This emits the complete, CI-valid contract set (`domain.module.yaml`,
   `contracts/*.screen.yaml`, and the required `contracts/ ui/ forms/ permissions/
events/ migrations/ i18n/ tests/ compliance/` directories).

## Quick self-check before pushing

```bash
pnpm install --frozen-lockfile
# must print "Domain contract check passed."
pnpm run check:domain-contracts
# must have no findings
pnpm run check:scaffold
```

If `check:domain-contracts` lists `modules/<domain> missing required directory …`
or `requires at least one *.screen.yaml contract`, you've put non-module content
under `modules/` — move it out (ask #2) or generate a real module (ask #4).
