---
name: codesphere-vendorportal
description: Use this skill for DevOps/CICD on the Codesphere vendorportal (Prod) vclusters — deploying/restarting/inspecting services through the `cs` CLI, because this Prod instance has no downloadable kubeconfig so every kubectl call must be proxied via `cs exec` (which has four sharp edges). Covers the shared workspace 149 BMS demo plus team-specific vendorportal app workspaces such as active public GTC Builder workspace 339 (team 86), the deleted workspace 253 tombstone, and CHOS-CODE-Innovation workspace 247. Bundles tested bash wrappers (doctor/wake/status/logs/kubectl/restart/deploy/caddy-reload) under `scripts/` for workspace 149. Triggers on phrases like "deploy sift-assist-pro", "codesphere", "vendorportal", "cs exec", "cs CLI", "workspace 149", "workspace 247", "workspace 339", "workspace 258", "workspace 253", "builder.vendorportal.gtplatforms.org", "bms namespace", "rg-57", "cs sync landscape", "Caddyfile 502", "Workspace is not running", PSS-restricted / "no objects passed to apply" / "Execution timed out" errors, and edits to `ansible/playbooks/codesphere-vendorportal/`, `codesphere-vendorportal/kubernetes/`, `codesphere-vendorportal/gtc-builder/`, or `secrets/codesphere.cfg`. NOT for the retired `codesphere-bms` (govmvp) MVP, which used a downloadable kubeconfig.
compatibility: Requires the codesphere-cloud `cs` CLI and `secrets/codesphere.cfg` (CS_API/CS_TOKEN/CS_WORKSPACE_ID); kubectl runs via `cs exec` (no kubeconfig); `cs-deploy` needs ansible + the senticor006 vault. Controller: macOS/Linux. The bundled scripts hard-pin the shared Codesphere Prod workspace 149 unless explicitly overridden; for team-specific workspaces use explicit `--team` / `--workspace` flags.
metadata:
  author: Senticor-ai/infrastructure
  version: "1.0"
---

# Codesphere vendorportal (Prod) DevOps/CICD

Operational skill for the Codesphere **vendorportal** vcluster — the shared dev "Prod"
instance (`vendorportal.gtplatforms.org`, team 57, workspace `149`/`bms-demo`) that replaced the
retired `codesphere-bms` (govmvp) MVP. Full background lives in
[codesphere-vendorportal/README.md](../../../codesphere-vendorportal/README.md); this skill is the
**how-to-operate-it** layer plus a set of bundled scripts that encapsulate the platform's quirks so
common tasks are reliable instead of hand-assembled.

## Why this is fiddly

This Prod instance exposes **no downloadable kubeconfig** — the vcluster API (`https://k8s.rg-57`) is
only reachable from inside the workspace. So every `kubectl` runs through the
[`cs` CLI](https://github.com/codesphere-cloud/cs-go)'s `cs exec`, which has four edges that bite on
_every_ command. The bundled scripts already handle all four; do **not** re-derive them by hand.

| #   | Quirk                                                                                                                                                  | Rule the scripts encode                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `cs exec` has a **~5s server-side timeout** (HTTP 408). `kubectl rollout status/wait --timeout=…` always fails.                                        | Poll in short calls. `cs_wait_available` loops a tiny `kubectl get -o jsonpath` (`retries 30 / delay 5`).                                                                                |
| 2   | `cs exec` writes the inner command's **stdout to its own stderr**, framed `running command …\nSTDOUT:\n`. Naive captures look empty.                   | `cs_run` captures both streams (`2>&1`) and strips the framing → clean stdout.                                                                                                           |
| 3   | `cs exec` **does not forward stdin** — `cat f.yaml \| cs exec -- 'kubectl apply -f -'` silently applies nothing (`error: no objects passed to apply`). | `cs_apply_file` heredoc-embeds the manifest inline. `cs-kubectl.sh apply -f <file>` routes through it automatically.                                                                     |
| 4   | The vcluster enforces **PSS `restricted:latest`** on every namespace via a mutating webhook (relabel snaps back).                                      | Workloads must be non-root, drop ALL caps, `allowPrivilegeEscalation:false`, `seccompProfile:RuntimeDefault`, no ports <1024. See the `sift-assist-pro` deployment (uid 101, port 8080). |

Plus: the vcluster DNS pattern is `<svc>-x-<ns>-x-k8s.rg-57:<port>` where **`rg-57` = `rg-<team-id>`**
(copying a Caddyfile from the MVP's `rg-10` breaks DNS); and editing `Caddyfile.frontend`/`ci.*.yml`
needs `cs sync landscape -p demo` to actually reload — `cs start pipeline … run` does **not** re-read
the cached config (symptom: stale 502s pointing at the old upstream).

**On-demand sleep.** Workspace 149 is on-demand and sleeps when idle. While stopped, every `cs exec`
returns `400 (Workspace is not running)` and the scripts emit a "wake it first" hint. Run
`cs-wake.sh` (the scripts intentionally do **not** auto-wake — waking spins up shared Prod). `cs-doctor`
reports this as `workspace_running: false`.

## Topology

```
Internet ─┬─ bms.vendorportal.gtplatforms.org ────────┐  (two co-equal front doors,
          └─ 149-3000.1.vendorportal.gtplatforms.org ─┤   same backend)
                                                       ▼
                              Codesphere workspace 149 :3000  (Caddy)
                                                       ▼
                          vcluster svc  sift-assist-pro-x-bms-x-k8s.rg-57:80
                                                       ▼
                              Deployment sift-assist-pro (ns: bms, uid 101, :8080)
```

A rollout-restart of the backend refreshes what _both_ URLs serve. The container image is built by CI
in `Senticor-ai/sift-assist-pro` (push to `main` → `frontend:latest` → STACKIT registry); the CD half
on this side is "pull latest → restart".

## Prerequisites (one-time)

- `cs` CLI installed: `gh release download -R codesphere-cloud/cs-go -O ~/.local/bin/cs -p '*darwin_arm64' && chmod +x ~/.local/bin/cs` (the scripts auto-find `~/.local/bin/cs` if it isn't on `$PATH`).
- `secrets/codesphere.cfg` present (gitignored secret) exporting `CS_API` / `CS_TOKEN` / `CS_WORKSPACE_ID`. The scripts **self-source** it, so you don't have to `source` it first.
- For `cs-deploy.sh` only: the vault file `secrets/senticor006-vault.yml` (STACKIT registry creds).

## Available scripts

All under `scripts/`, run from the repo root as `bash .claude/skills/codesphere-vendorportal/scripts/<x>.sh`.
Every script supports `--help`; mutating ones support `--dry-run`. Shared exit codes:
**0** ok · **1** usage/config · **2** target mismatch (safety abort) · **3** op failed/timeout.

- **`cs-env.sh`** — sourced foundation (not run directly): locates repo root + `cs`, self-sources the cfg, and exposes `cs_assert_target` / `cs_run` / `cs_apply_file` / `cs_wait_rollout` / `cs_workspace_running`. Every other script sources it.
- **`cs-doctor.sh`** _(read-only)_ — preflight health check; prints a JSON object (cs version, workspace, `workspace_running`, vcluster API, namespace reachable). **Run this first.**
- **`cs-wake.sh [--sync-landscape] [-p demo] [--dry-run]`** _(mutating)_ — wake the on-demand workspace when it has gone to sleep (see below). `--sync-landscape` also reloads Caddy.
- **`cs-status.sh [-n NS]`** _(read-only)_ — deploy/pods/svc + recent events for a namespace.
- **`cs-logs.sh [-n NS] [TARGET] [--tail N]`** _(read-only)_ — bounded log snapshot (never `-f`; the 5s cap forbids streaming).
- **`cs-kubectl.sh [--dry-run] -- <kubectl args…>`** — general escape hatch; `apply -f <file>` is auto-heredoc'd. Pass `-n` yourself.
- **`cs-restart.sh [-n NS] [DEPLOY] [--dry-run]`** _(mutating)_ — rollout-restart + poll Available. The quick "pick up latest `:latest`" path.
- **`cs-deploy.sh [--dry-run] [-- ansible args]`** _(mutating)_ — thin wrapper over the existing `ansible/playbooks/codesphere-vendorportal/sift-assist-pro.yml` (full idempotent re-deploy + pull-secret). Set `ANSIBLE_VAULT_PASSWORD_FILE` for non-interactive, else it adds `--ask-vault-pass`.
- **`cs-caddy-reload.sh [-p demo] [--dry-run]`** _(mutating)_ — `cs sync landscape` to reload Caddy after a `Caddyfile.frontend`/`ci.*.yml` edit.

## Common tasks

| Task                                    | Command                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Confirm wiring (do this first)          | `bash .claude/skills/codesphere-vendorportal/scripts/cs-doctor.sh`                             |
| Wake the workspace (if asleep)          | `… /cs-wake.sh` (or `… /cs-wake.sh --sync-landscape` to also start Caddy)                      |
| What's running in `bms`                 | `… /cs-status.sh`                                                                              |
| Recent app logs                         | `… /cs-logs.sh --tail 200`                                                                     |
| Ad-hoc read                             | `… /cs-kubectl.sh -- get pods -n bms -o wide`                                                  |
| Pick up a new `:latest` image           | `… /cs-restart.sh`                                                                             |
| Full re-deploy (re-creates pull-secret) | `… /cs-deploy.sh`                                                                              |
| Apply edited manifests                  | `… /cs-kubectl.sh apply -f codesphere-vendorportal/kubernetes/sift-assist-pro/deployment.yaml` |
| Reload Caddy after config edit          | `… /cs-caddy-reload.sh`                                                                        |

## Safety

- **Read-only / safe anytime:** `cs-doctor`, `cs-status`, `cs-logs`, and `cs-kubectl … get/describe/logs`.
- **Mutating shared Prod:** `cs-wake`, `cs-restart`, `cs-deploy`, `cs-caddy-reload`, and any non-read `cs-kubectl`. This is a shared **production** instance — **confirm with the user before running**, and prefer `--dry-run` to preview first (per the repo's standing "ask before running deploys" rule).
- The scripts hard-pin the target to **workspace 149 / vendorportal** (`cs_assert_target`, exit 2 on mismatch) so a stray `source secrets/<other>.cfg` can't aim destructive ops at the wrong cluster. To target a different workspace, set `CS_EXPECTED_WORKSPACE_ID` deliberately — don't silently repoint.
- Never commit `secrets/codesphere.cfg` or `secrets/senticor006-vault.yml` (both gitignored).

## Deploy contract & validation (the agent-agnostic seam)

The **Deutschland Plattform = Codesphere on STACKIT**. A vendor builds with _their own_
IDE/agent, but a manifest must satisfy a **deploy contract** before it lands on the
Plattform — because the platform rules (no kubeconfig → `cs exec`; PSS `restricted`
webhook) bite regardless of which agent wrote the YAML. Since SKILL.md is only read by
some agents and is advisory, the contract is enforced **deterministically** by one
validator with **three call sites**:

`scripts/platform-validate.py` (Python + PyYAML) checks every workload manifest for:
**namespace** present, and PodSecurity **restricted** (runAsNonRoot, no runAsUser 0,
`allowPrivilegeEscalation:false`, `capabilities.drop:[ALL]`, seccomp RuntimeDefault, no
`privileged`, container port ≥ 1024, no host namespaces / hostPath). Non-`registry.onstackit.cloud`
images are a warning. Exit 0 ok / 1 violations / 2 usage. Output is human or `--json`.

- **Agent / local validation loop:** `python3 scripts/platform-validate.py <manifest…>` (or `--json`). Run it before proposing/applying a manifest and fix until clean — this is what makes the contract portable across IDEs/agents.
- **git pre-commit hook:** `scripts/git-hooks/validate-platform-manifests.sh` validates staged `codesphere-vendorportal/kubernetes/**` manifests (escape hatch `HUSKY=0`).
- **CI:** the "Deutschland-Plattform deploy contract" job in `.github/workflows/pr-infrastructure-ci.yml` self-tests the validator and hard-blocks non-compliant changed manifests.

Tests: `tests/test-platform-validate.sh` (+ `tests/fixtures/`). This contract is the v1
**reference pattern** other Plattform vendors copy.

## Supporting files (load on demand)

Keep this SKILL.md as the always-loaded core; pull these in only when the task calls for it:

- **`references/cs-exec-troubleshooting.md`** — load when a `cs exec`/kubectl call fails or errors unexpectedly (408 timeout, empty output, `no objects passed to apply`, PSS rejection, `Workspace is not running`, `rg` DNS 502). An error → cause → fix table.
- **`references/sovereignty-and-govtech.md`** — load for the strategic/architectural background on _why_ the stack pairs Codesphere (portable runtime) with STACKIT (sovereign EU infra) for German public-sector work. Background context, not operations.
- **[`codesphere-vendorportal/gtc-builder/README.md`](../../../codesphere-vendorportal/gtc-builder/README.md)** — load for active public GTC Builder workspace `339`, the deleted workspace `253` tombstone, CHOS workspace `247`, the OpenCode mirror rollout, and the CHOS `/api/chos-flow` proxy contract.
- **`assets/deployment.template.yaml` + `assets/service.template.yaml`** — copy these to onboard a **new** service to the `bms` namespace; they are PSS-restricted-compliant skeletons (replace the `__PLACEHOLDERS__`).
- **`evals/evals.json`** — behavioural eval cases (prompt + assertions) for testing/iterating this skill; see `evals/README.md`.
- **`scripts/platform-validate.py` + `tests/`** — the deploy-contract validator and its tests (see "Deploy contract & validation" above).

## Team-specific app workspaces: GTC Builder + CHOS flow

The newer vendorportal app workspaces reuse the same `cs` CLI sharp edges, but they are not all
workspace-149-style multi-service landscapes. The live GTC/CHOS wiring is:

| App                       | Team | Workspace | URL                                                |
| ------------------------- | ---: | --------: | -------------------------------------------------- |
| GTC Builder public        | `86` | see below | `https://builder.vendorportal.gtplatforms.org/`    |
| CHOS-CODE-Innovation      | `88` |     `247` | `https://247-3000.1.vendorportal.gtplatforms.org/` |
| CHOS runner / flow origin | `88` |     `247` | `https://247-3001.1.vendorportal.gtplatforms.org/` |

**GTC Builder's workspace ID is no longer pinned to 339 (2026-07-04).** Since the blue/green
redesign (see "GTC Builder roll-forward" below), each deploy creates a new workspace and cuts
the domain over to it — 339 was the ID live before the first blue/green deploy, not a fixed
target. Check the `GTC_BUILDER_LIVE_WORKSPACE_ID` repo variable in
`Senticor-ai/infrastructure`, or query ground truth with
`GET /domains/team/86/domain/builder.vendorportal.gtplatforms.org` (the `workspaces` field),
before assuming any specific ID is live.

Team `89` / workspace `253` was deleted on 2026-07-01 because it was the wrong
GTC Builder target. Do not deploy there or recreate it for the public builder.

**Token scope.** The CS_TOKEN in `secrets/codesphere.cfg` (team 57) is an **org-wide user
token** — it works for all Senticor teams when passed via `-t <team>` CLI flags. You do
NOT need `secrets/codesphere.cfg.chos-code` (team 88) or a separate token to run ad-hoc
`cs exec -t 88 -w 247` commands. The `.cfg.chos-code` file is only needed by `deploy.sh`
which reads `CS_WORKSPACE_ID` from env instead of CLI flags.

**CHOS image-tag update (no deploy.sh).** For CI build → roll forward (the common case),
use the lightweight `cs-update-image.sh` script — no local CHOS checkout or
`secrets/chos-code-runtime.env` required:

```bash
# find the new tag (first 12 chars of GITHUB_SHA; full 40-char SHA is accepted)
gh run list -R Senticor-ai/CHOS-CODE-Innovation --branch main --status success --limit 1
bash codesphere-vendorportal/chos-code-opencode/scripts/cs-update-image.sh <TAG>
```

Do not hand-truncate to 10 or 11 chars: Harbor images are published with the
workflow `sha12` tag. The helper normalizes a full commit SHA and rejects
non-12-char short SHAs before Kubernetes can enter `ImagePullBackOff`.

`chos-code-runner` is **6 containers** — runner/docs/log-forwarder/flow/
pod-status-poller/**session-poller** — and `cs-update-image.sh` patches all
six. `session-poller` was missing from this list until 2026-07-03 (infra#665):
it silently never moved off whatever tag it first deployed with, through every
prior rollout, until this was found by inspecting the live deployment
directly. The readiness poll is **300s** (60 attempts × 5s) — raised from an
original 120s that was too short for the (correctly) 6-container rollout,
not evidence of a self-revert (infra#672; see the operational notes in
`codesphere-vendorportal/gtc-builder/docs/README.md` for the full live-validation story).

Before running an image-only update, confirm `deployment/chos-code-runner` mounts
volume `data` from a PVC. `cs-update-image.sh` now refuses to roll if `/app/.chos`
is backed by `emptyDir`, because `Recreate` plus `emptyDir` wipes opencode DB and
CHOS flow sessions on every pod recreate. Use the full `deploy.sh` with the
default `DATA_VOLUME_MODE=pvc` to repair persistence; override only with
`ALLOW_EPHEMERAL_CHOS_CODE_DATA_ROLLOUT=true` for throwaway environments.

Use the full `deploy.sh` only for first-time provisioning, manifest changes,
pull-secret rotation, or repairing the data-volume/PVC wiring.

**GTC Builder roll-forward is blue/green (2026-07-04, infra#678)** — each deploy creates a
brand-new workspace from the GitLab mirror, builds/verifies it, then cuts
`builder.vendorportal.gtplatforms.org` over to it (`PUT
.../domain/<domain>/workspace-connections`, body `{"/": [<id>]}` at the top level — see
"Front-door domains" below for the schema trap). The previous live workspace is left running
as the rollback target. Mechanics: `codesphere-vendorportal/gtc-builder/scripts/cs-deploy-bluegreen.sh`.
Trigger:

```bash
gh workflow run deploy-gtc-builder-on-demand.yml -R Senticor-ai/infrastructure -f mode=deploy
gh workflow run deploy-gtc-builder-on-demand.yml -R Senticor-ai/infrastructure -f mode=rollback
```

This replaced an earlier in-place design (`cs wake-up` → `cs git pull` → `reset --hard` →
pipeline → `kill 1`, all against one long-lived workspace 339) after that workspace's
control-plane got stuck reporting `Workspace is not running` for ~12h across 3 attempts,
fixable only by a manual IDE-console stop/start (see "Mirror-image desync" above). The old
in-place sequence still exists as `cs-deploy.sh`, useful for a manual/emergency patch directly
against whichever workspace is currently live (its hardcoded default of workspace 339 is
stale outside a fresh-from-339 world — pass `GTC_BUILDER_WORKSPACE=<current live id>`):

```bash
bash codesphere-vendorportal/gtc-builder/scripts/cs-deploy.sh
# or manually:
source secrets/codesphere.cfg
cs wake-up -t 86 -w 339 --timeout 10m
cs git pull -t 86 -w 339 --remote origin --branch main
cs exec -t 86 -w 339 -- "git -C /home/user/app reset --hard origin/main"   # required, see WHY note below
cs start pipeline --team 86 --workspace 339 --profile default --timeout 20m prepare test run
cs exec -t 86 -w 339 -- "kill 1"   # required — cs start pipeline run alone won't reload code/env
sleep 45   # settle before checking, or the dev-domain 429-locks you out
cs curl -t 86 -w 339 /api/bootstrap/status --timeout 20s -- -sS -i
curl -sS -i https://builder.vendorportal.gtplatforms.org/api/bootstrap/status
```

`cs-deploy.sh` follows `cs git pull` with a **local-only `git reset --hard
origin/$BRANCH`** (2026-07-03, infra#663/#670) — `cs git pull` is a real
fetch+merge, not fetch+reset, and once the workspace's local branch has any
commit `origin` doesn't (even one created by a _previous_ pull's own merge),
git creates a new merge commit instead of fast-forwarding, compounding across
every deploy. Confirmed live: the workspace had drifted 7 commits "ahead" of
`origin/main`, entirely via merge commits that existed only inside the
workspace. A raw `git fetch` via `cs exec` fails with `could not read
Username for 'https://gitlab.opencode.de'` — `cs git pull` injects GitLab
mirror credentials through a path plain git doesn't have — so the fetch still
goes through `cs git pull`; only the reset (touching no remote) can bypass it.

**On-demand deploy via GitHub Actions.** Both roll-forward commands above
are also available as `workflow_dispatch`-only GitHub Actions in `Senticor-ai/infrastructure`
— `.github/workflows/deploy-chos-code-on-demand.yml` and
`.github/workflows/deploy-gtc-builder-on-demand.yml`. Neither runs on a schedule or a push;
someone has to click "Run workflow" (or `gh workflow run <file> -R Senticor-ai/infrastructure`),
which is what lets any number of merges batch up between deploys instead of firing on every
green build — the vendorportal is also used by testers, so an automatic per-merge deploy is
the wrong default. Each workflow resolves the latest green build itself (or an explicit
`image_tag`/`ref` override), no-ops if that's already what's live, and re-checks the live
state ~100s after deploying (see the 2026-07-03 self-revert note in `codesphere-vendorportal/gtc-builder/docs/README.md`
for why). CHOS-CODE supports `mode: rollback` (redeploys the last-known-good tag, tracked in
the `CHOS_CODE_PREVIOUS_TAG` repo variable — trivial since Harbor keeps every tagged image).
**GTC Builder also supports `mode: rollback` (2026-07-04)** — the blue/green redesign made
this possible for the first time: it cuts `builder.vendorportal.gtplatforms.org` back to
`GTC_BUILDER_PREVIOUS_WORKSPACE_ID` (a still-running workspace, no rebuild), tracked the same
way as CHOS-CODE's tag (advanced only on a successful forward deploy, never on rollback, so
repeated rollbacks stay idempotent). GTC Builder's no-op check compares against a
`GTC_BUILDER_LAST_VERIFIED_SHA` repo variable rather than the raw checked-out git SHA — the
marker is only advanced after a real, verified cutover, never on a build/verify failure.
A colleague only needs GitHub repo access to trigger either workflow — no local
`secrets/codesphere.cfg` copy, no `cs`/`gh` CLI setup.

**Credentials backing the on-demand workflows** (created via `gh api`/`gh secret set`,
2026-07-03 — not stored anywhere else): two GitHub Environments, `chos-code-deploy` and
`gtc-builder-deploy`, each holding a `CS_CONFIG_B64` secret (base64 of a `codesphere.cfg`-
shaped config for that app's team/workspace); plus one repo-level secret,
`GH_CROSS_REPO_TOKEN`, used for `gh run list`/`gh api` calls against
`Senticor-ai/CHOS-CODE-Innovation` and `Senticor-ai/gtc-builder` (a different repo than the
one the workflow runs in — the default `GITHUB_TOKEN` can't reach either), and for `gh
variable set` on this repo's own `CHOS_CODE_PREVIOUS_TAG`/`GTC_BUILDER_LAST_VERIFIED_SHA`
(the default `GITHUB_TOKEN` also can't write repo Variables — there's no `variables`
permission key). `GH_CROSS_REPO_TOKEN` is currently the operator's own `gh auth token`
(broad personal scope), not a narrowly-scoped fine-grained PAT — minting one isn't possible
via CLI/API, only the GitHub web UI. Known tradeoff, not an oversight; swap the secret value
for a fine-grained PAT later if tighter scoping is needed.

Rules learned from the GTC Builder to CHOS flow hookup:

- `ci.default.yml` means **profile `default` is required** on `cs start pipeline` and
  `cs sync landscape`. Without it, Codesphere may emit misleading `500` / "Multi Server
  Deployment" errors. Use long flags so `-t` is not confused with pipeline timeout:
  `cs start pipeline --team 86 --workspace 339 --profile default --timeout 20m prepare run`.
- `cs exec` and `cs log` do **not** take `--profile`. If `--profile default` appears after
  `cs exec --`, it is passed to the inner shell command and can break tools like `sed`.
- `cs sync landscape --profile default` **does** work on single-service workspaces like GTC
  Builder `339` (the earlier "Multi Server Deployment" rejection was the missing-`--profile`
  symptom, not a real single-service restriction — see the restart-limits section below for what
  `sync` actually does and doesn't do).
- The GitLab/Codesphere credential setup is a client-hydrated `Credentials` key button
  in the Console top bar. Raw SSR HTML can miss it. Verify the live build with
  `/api/bootstrap/status` returning `200` on both `cs curl -t 86 -w 339` and
  `https://builder.vendorportal.gtplatforms.org/api/bootstrap/status`.
- Codesphere app workspaces use the OpenCode/GitLab mirror as `origin`. The GitHub mirror workflow
  mirrors only validated `main`; a pre-merge smoke deploy needs the PR branch pushed to OpenCode
  first, then `cs git pull --remote origin --branch <branch>`.
- The GTC browser must not call the CHOS runner directly with credentials. Configure GTC with
  `GTC_CHOS_FLOW_UPSTREAM_URL=https://247-3001.1.vendorportal.gtplatforms.org` and
  `GTC_CHOS_FLOW_BASIC_AUTH=opencode:<server-password>`; the Node server publishes
  `CHOS_FLOW_URL=/api/chos-flow` to the browser and injects auth server-side.
- **Codesphere public URL routing: the `247-3001.1.vendorportal.gtplatforms.org` domain is handled
  by the Caddy `:3000 {}` server block, NOT `:3001 {}`.** Codesphere routes both
  `247-3000.*` and `247-3001.*` to port 3000 via the `paths` config. The `@api_host host
247-3001.1.vendorportal.gtplatforms.org` matcher in the `:3000 {}` block is the correct
  place for API-specific routing (CORS, `/flow/*` proxy). The `:3001 {}` block is only hit
  from internal Codesphere traffic. Consequence: any `/flow/*` → port 4124 route must live
  inside `handle @api_host { route { ... } }` in the port 3000 block — not in `:3001 {}`.
- **CHOS flow server (`flow` container) runs on port 4124 (TCP proxy → 127.0.0.1:4123).** The
  `flow` container in the `chos-code-runner` pod starts `packages/fachverfahren/flow-server.ts`
  on port 4123 and a TCP proxy on `0.0.0.0:4124`. The k8s Service exposes both port 8888
  (opencode IDE, `runner` container) and port 4124 (`flow` container, named port `flow`).
  Caddy in the run stage CAN reach port 4124 via `chos-code-runner-x-$NS-x-k8s.$RG:4124`;
  the flow server returns `{"ok":true,"runner":"opencode","auth":false}` — no auth required.
  Route `/flow/*` and `/flow` inline in `handle /flow/* { }` blocks inside the `route {}` to
  place them before the catch-all `handle { reverse_proxy ...:8888 }`.
  `deploy.sh render_frontdoor()` now generates this correctly in both the `@api_host` and
  `:3001 {}` blocks (added 2026-06-30).
- Capture the CHOS `server-password` without echoing it. `cs exec` frames stdout on stderr, so use
  `2>&1` and parse after `STDOUT:` before feeding `cs set-env`. Never paste the decoded password
  into docs, PRs, or chat.
- **Faro RUM CORS has two independent gates — both must include every new browser origin.** The
  Traefik `faro-cors` middleware (`senticor007/kubernetes/observability/faro-ingest.yaml`) and the
  Alloy `faro.receiver "rum"` `cors_allowed_origins` list (`alloy-configmap.yaml`) are checked
  separately. Adding an origin to only one of them still blocks the browser with a CORS error.
  After editing both, restart the Alloy DaemonSet to reload the configmap.
- **GTC Builder `beforeSend` depth truncation corrupts OTLP spans (gtc-builder#3).** The Faro SDK
  `beforeSend: Pl` hook caps recursion at depth 6; OTLP spans sit at depth 7 and become the string
  `"[truncated]"`. Alloy returns 400 (`ReadObject: expect {`). Non-trace signals (logs, events,
  measurements) are unaffected and arrive correctly. The fix is in the GTC Builder source — pass
  `traces` through unmodified in `beforeSend`. See
  [codesphere-vendorportal/gtc-builder/README.md](../../../codesphere-vendorportal/gtc-builder/README.md#faro-rum-telemetry)
  for the full two-layer CORS setup and reproduction steps.
- **Browser console triage.** `ObjectMultiplex - orphaned data` / `malformed chunk without name`
  is usually browser-extension noise. `faro.cognitive-hive.ai/collect 400` is the known GTC
  `beforeSend` app bug above. `builder.vendorportal.gtplatforms.org/api/chos-flow/... 502` or
  `/api/telemetry/client 502` is real app/proxy evidence: verify workspace `339` with `cs curl`
  before changing CORS or telemetry. In GTC logs, `/api/chos-flow` 504 usually means the CHOS
  flow sidecar was slow or failed liveness; 429 means Codesphere dev-domain rate limiting from
  repeated polling during warmup/recovery. For `/flow/events?...ERR_HTTP2_PROTOCOL_ERROR`, do a
  bounded `cs curl -N` SSE check and inspect CHOS flow logs only if it fails repeatedly.

Verification for the live GTC proxy:

```bash
source secrets/codesphere.cfg
cs curl -t 86 -w 339 /runtime-config.js --timeout 20s -- -sS
cs curl -t 86 -w 339 /api/chos-flow/flow/health --timeout 30s -- -sS -i
cs curl -t 86 -w 339 /api/chos-flow/flow/sessions --timeout 30s -- -sS -i
```

### Native `run`-stage restart limits — no clean "redeploy" exists (infra#635, 2026-07-02)

This applies specifically to Codesphere-native `ci.yml` `run.<service>` process workspaces
(GTC Builder ws `339` today; would apply to any future plain `run.web`-style workspace). It does
**not** apply to the k8s/vcluster-hosted workspaces (CHOS ws `247`, chos-rc/bms-rc) — those are
updated via `kubectl set image`/`deploy.sh`/`cs-update-image.sh`, which correctly recreate pods
with fresh images/env on every apply. The gap below is unique to the simpler always-on
`run.web` process model.

**Root cause of the original bug:** only `/home/user/app` is persisted across a workspace
restart — everywhere else (`$HOME/.local`, `$HOME/.npm-global`, etc.) is pod-local ephemeral
disk and is wiped on every restart. Any `prepare` step that installs a tool onto a workspace's
own `PATH` (`glab`, `cs`, or similar) **must** install under `/home/user/app/...` (see
`gtc-builder`'s `ci.default.yml` for the pattern) or it silently evaporates the next time the
workspace restarts for any reason.

**Bigger finding: none of the CLI's "restart" primitives force a real redeploy of an
already-healthy `run.web` process.** All verified empirically on ws `339`:

- `cs start pipeline run` — a documented **health-check-restart-on-crash** mechanism, not a
  redeploy trigger. No-op if the process is already running, regardless of what changed in
  `prepare`/`run`'s declared command or in workspace env vars.
- `cs scale workspace --service web=0` — rejected by the API (`expected a type of
'PositiveInteger', got: '0'`); you cannot scale an always-on service to zero this way.
- `cs scale workspace --service web=2` then `web=1` — creates a second replica, but scaling back
  down keeps the **original** stale replica, not the new one. Not usable as a "replace primary"
  trick.
- `cs sync landscape --profile default` — only reconciles **declared infra shape** (replicas,
  plan, network, managed services) against current config; a no-op if nothing in that shape
  changed. Tested the extreme case too: setting `run: {}` (removing the service entirely) and
  syncing **only removes the network route** (causes public 502s) — the underlying pod/process is
  left running untouched. Restoring the block and re-syncing brings the route back on the _same_
  unchanged process. Sync is not a compute-recreation lever at all.
- `kill 1` inside the workspace (via `cs exec`) **does** cause a full container-level restart
  (Codesphere's ingress briefly shows "workspace is starting"), but the fresh container boots
  from a state that (a) does NOT replay `prepare`, and (b) does NOT pick up **any** env vars set
  via `cs set-env` since the last time the workspace was genuinely first-started — verified twice,
  including immediately after `kill 1` with a clean, untouched 90s wait. Env var injection and
  `prepare` execution both appear to happen only at a genuine first-boot event, not on a
  crash/kill-triggered respawn.

**Practical consequence for `cs set-env`:** the CLI reference's only documented pattern is
`cs create workspace` → `cs set-env` → `cs start` — i.e. set env **before the first-ever start of
a brand-new workspace**. There is no documented (or discovered) way to make new/changed env vars
reach an _existing_, already-running `run.web` workspace. This means any past or future runbook
step here that does `cs set-env ... ` then `cs start pipeline ... run` (e.g. rotating
`GTC_CHOS_FLOW_BASIC_AUTH`, or the credential-bootstrap flow pushing `GITLAB_TOKEN`/PAT env vars
into ws `247`) **should be verified functionally afterward, not trusted from the command's exit
code** — it may silently not take effect until the workspace's process happens to restart for an
unrelated reason.

**The only lever that forces a genuine full compute+env refresh is deleting and recreating the
workspace** (`cs delete workspace` → `cs create workspace` → `cs git pull` → `cs set-env` →
`cs start`, matching the CLI reference's own bootstrap example). This is a last resort, not a
routine fix: workspace **Deletion** (unlike **Teardown**) clears all persistent volumes and
everything not tracked in git — including every `cs set-env` value, since there is no
`cs get-env`/`cs list env` to read them back first. It also loses the workspace ID, requiring a
manual custom-domain rebind (UI-only, no `cs domain` command) for anything on a public custom
domain.

**Operating philosophy (we are pre-launch — no 0-downtime requirement):** prefer a real,
visible restart/recreate with accepted downtime over any live filesystem patch. Do not `cp`/edit
files directly inside a running workspace to route around a stale-state problem, even
temporarily — fix the declared config (`ci.default.yml`, env vars) and get it into the live
process through an actual restart/recreate, or accept that it's pending until the next natural
one. See `feedback_immutable_infra_no_live_patching` in memory for the reasoning.

**Refinements from the gtc-builder OIDC rollout (2026-07-02, ws 258→339):**

- `kill 1` env-var staleness isn't 100% deterministic either way: a **second**
  `kill 1` + wait + `cs start pipeline run` cycle occasionally applied a change
  the first cycle didn't. Not something to rely on, but before concluding a
  `cs set-env` change is permanently stuck, try one more full cycle.
- The **declared `run` command itself** (not just env vars) is also never
  re-read by `kill 1`/`run`/`sync` — confirmed on a workspace where the service
  had _never_ successfully started even once, ruling out "it only refuses to
  update an already-healthy process" as the mechanism. A changed `command:` in
  `ci.default.yml` needs delete+recreate to actually take effect, same as env
  vars.
- `nix-env` package installs (`nix-env -iA nixpkgs.<pkg>`) do **not** persist
  across a restart — same `/home/user/app`-only persistence rule that already
  applies to `cs`/`glab`, but easy to miss for a "just install X via nix" prepare
  step. A package installed this way vanishes on the next `kill 1`, and the
  resulting "command not found" in the run stage has no clear surfaced error —
  it just shows as the service never coming up. Install anything that must
  survive a restart as a static binary under `/home/user/app/.local/bin`
  instead.
- `cs log -s web` and the dev-domain proxy can both report stale/wrong state
  (persistent "no running instance" or "workspace is starting") while
  Codesphere's own web UI ("Deployment and Execution" page) showed accurate
  real-time status (`Service: web — Healthy`) the whole time. Check the UI
  before concluding a service is actually down.
- The dev-domain `429` lockout's own error page text covers two unrelated
  causes ("too many requests" _or_ "workspace was stopped or hasn't been set up
  properly") — don't assume every 429 is the rate-limit; it can also mean the
  run stage genuinely never started.
- **Mirror-image desync: control plane says asleep, app is actually up
  (2026-07-03/04, infra `deploy-gtc-builder-on-demand.yml`).** Two deploy runs
  in a row, ~12h apart, saw `cs wake-up -t 86 -w 339 --timeout 10m` poll for
  the full 10 minutes and time out, then `cs exec -t 86 -w 339 -- "true"` 400
  ("Workspace is not running") — while `curl
https://339-3000.1.vendorportal.gtplatforms.org/api/bootstrap/status` and
  the custom domain both returned a healthy `200` the entire time. The
  run-stage process was never actually down; only Codesphere's control plane
  (what `cs wake-up`/`cs exec` talk to) thought so. Before assuming a real
  outage or spending 10 minutes waiting on `cs wake-up`, `curl` the app's own
  public endpoint directly — if that's healthy, the wake-up poll will not
  succeed and the actual blocker is `cs exec` itself being unreachable. The
  workflow's "Wake workspace + verify reachability" step now does this curl
  check first to fail fast instead of burning the full 10-minute timeout.
  **The actual fix (confirmed, infra#678): a manual stop/start (rebuild) via
  the Codesphere IDE web console** (`https://vendorportal.gtplatforms.org/ide/teams/86/workspaces/<id>`).
  Every API/CLI lever was tried first and all failed identically with `400
Workspace is not running`: `cs wake-up` (verbose trace shows it's just
  `PATCH /workspaces/{id} {"replicas":1}` — a no-op when `replicas` is already
  recorded as `1`), `cs git pull`, `cs exec`, the documented
  `POST /workspaces/{id}/pipeline/run/start` ("restart Application") and
  `POST /workspaces/{id}/pipeline/prepare/start` endpoints, and there is no
  dedicated `/workspaces/{id}/start` endpoint (404). After the manual UI
  stop/start, `isRunning` flipped to `true` and everything worked normally
  again. If this recurs, go straight to the IDE console rather than re-probing
  API/CLI options. **This is a well-substantiated dead end, not an unexplored
  gap** — also tried and ruled out directly: `PATCH /workspaces/{id}
{"replicas":0}` (flatly rejected, `400 expected PositiveInteger, got 0` —
  no way to explicitly stop a workspace via this field) and
  `POST /workspaces/{id}/restart` / `.../stop` (real `404`s, distinct from
  this API's `OPTIONS` response which is a generic CORS-preflight handler —
  permissive for literally any path, including ones that don't exist, so it
  proves nothing about real route support; see the domain-routing entry
  below for the same trap). Reverse-engineering the IDE's own JS bundle
  (`vendorportal.gtplatforms.org/ide/teams/<t>/workspaces/<w>` →
  `/ide/assets/index-*.js`) confirms _why_: workspace lifecycle actions in
  the console don't go through the public REST API at all. They go through
  a proprietary RPC transport the bundle itself names `StreamyClient` —
  typed `{service, method, data}` calls over a session-oriented
  `procedureTransport`, almost certainly WebSocket-based and authenticated
  via the browser session cookie, not the `CS_TOKEN` bearer this repo's
  automation has. A pod-scoped `restart` RPC method exists
  (`{workspaceId, podName}`) but there's no way to drive it with the
  credentials available outside a real browser session. Conclusion: this
  action is not scriptable from CI with what we have — stop investigating
  API/CLI angles for it unless Codesphere ships a real public endpoint.
- Full write-up (including the actual OIDC root cause — a Node CA-trust-store
  difference, nothing to do with restart mechanics) in
  [`codesphere-vendorportal/gtc-builder/README.md`](../../../codesphere-vendorportal/gtc-builder/README.md#oidc-rollout-gtc-builder17--root-cause-fix-and-everything-learned-along-the-way).

Expected: runtime config contains `CHOS_FLOW_URL":"/api/chos-flow"`, health returns
`{"ok":true,"runner":"opencode"}`, and sessions returns JSON with a `sessions` array.

### GitLab-publish + Codesphere-deploy (CHOS-CODE-Innovation PR #35/#34, gtc-builder PR #21/#18)

CHOS-CODE-Innovation can auto-publish a generated project to GitLab and
auto-deploy it via Codesphere, gated behind `CHOS_GITLAB_PUBLISH_ENABLED`
(off/fail-closed by default). Full runbook, smoke/E2E validation, and
credential model: [`codesphere-vendorportal/chos-code-opencode/docs/early-repo-codesphere-deploy.md`](../../../codesphere-vendorportal/chos-code-opencode/docs/early-repo-codesphere-deploy.md).

- **GitLab publishing is one shared, infra-managed PAT** (`GITLAB_TOKEN` on
  the flow-server), not a per-user credential — set via `auth.sh` →
  `secrets/chos-code-runtime.env` → `deploy.sh`. The app's own base manifest
  (not this infra repo) already wires `GITLAB_TOKEN` to the `chos-code-secrets`
  Secret's `gitlab-opencode-pat` key and `CHOS_GITLAB_PUBLISH_ENABLED`/
  `GITLAB_HOST`/`CHOS_GITLAB_PUBLISH_GROUP` to the `chos-code-config`
  ConfigMap — `deploy.sh` only populates those existing keys via `replace`
  patches, it does not add its own env entries. Group default is `senticor`
  (`govtech-deutschland/platform-instances/deutschland-platform/senticor`
  on `gitlab.opencode.de`), not the old `exxeta` default.
- **Codesphere deploy credentials are runtime-only**, never a static secret —
  the Builder forwards a user-supplied Codesphere token to the flow-server's
  `POST /flow/credentials` (tenant-scoped, TTL-bound in-memory store) at
  session time. Do not add `BUILDER_CS_API_KEY`/`GTC_CODESPHERE_*` as a k8s
  Secret; that's a deliberately declined design, not an oversight.
- **Single destination today.** Only one GitLab host/group is wired
  (`GITLAB_HOST`+`CHOS_GITLAB_PUBLISH_GROUP` on CHOS, `GTC_GITLAB_GROUP` on
  Builder). If a second GitLab group, a different GitLab instance, or a
  GitHub destination is added, keep the credential and destination
  identifier as a pair of env vars per destination rather than overloading
  these single-value vars.
- **Validate with `codesphere-vendorportal/chos-code-opencode/scripts/validate-deploy.sh`** —
  `smoke` mode (safe, no real resources) checks `glab`/`cs` versions, PAT
  validity, group access, `/flow/status` shape, and the fail-closed flag
  state; `e2e` mode drives a real Builder → flow-server → GitLab →
  Codesphere run using test credentials supplied only via environment
  variables (`TEST_BUILDER_USERNAME`/`TEST_BUILDER_PASSWORD`/
  `TEST_CODESPHERE_TOKEN`), never CLI flags, and is human-triggered only —
  it creates real, billable GitLab/Codesphere resources.
- **Observability**: chos-flow-server already emits structured, phase-labeled
  JSON logs (`repo_created`/`repo_create_failed`, `phase_pushed`/
  `phase_push_failed`, `codesphere_deploy_started`/`succeeded`,
  `runtime_credentials_stored`/`rejected`/`cleared`) queryable today via
  `{namespace="chos-code"} | json | service="chos-flow-server" | event="..."`
  — no extra wiring needed for logs. A new dashboard row (`gtc-workshop-mvp`
  panels 100-105) and two alert rules (`gtc-chos-gitlab-publish` rule group in
  `setup-job.yaml`: deploy-stalled, repeated-credential-rejection) cover this.
  Prometheus counters (`chos_flow_deploy_total` etc.) exist in code but
  `/metrics` scrape coverage is **not** confirmed — don't assume it's wired
  just because the counters exist.
- **Known upstream gaps** (not infra's to fix): `deployCodesphere()` has no
  internal step-level logging (only one generic redacted failure message), no
  distributed tracing exists in CHOS-CODE-Innovation, and there are no custom
  Faro RUM events for the new publish/deploy UI actions.

## Combined-RC deploy: full CHOS + BMS from the signed Harbor bundle (infra #476)

Beyond the single sift SPA, the vendorportal is a **repeatable RC target** for the full
Cognitive-Hive-OS + BMS stack (OpenRouter inference), deployed the way a customer/operator
would — from the signed STACKIT Harbor `chos-release` bundle only. The two stacks live in
**separate Codesphere teams / vclusters**: **CHOS → team 70 (`rg-70`)**, **BMS → team 69
(`rg-69`)**; the sift demo stays in team 57. Identity is the external senticor007 `bms-rc`
realm. **Start at [codesphere-vendorportal/RUNBOOK.md](../../../codesphere-vendorportal/RUNBOOK.md)** — it is the per-RC deploy + rollback flow.

Key pieces (all reuse the four-quirk helpers; none re-derive them):

- Playbooks: [`chos.yml`](../../../ansible/playbooks/codesphere-vendorportal/chos.yml) (team 70, ns `hive`), [`bms.yml`](../../../ansible/playbooks/codesphere-vendorportal/bms.yml) (team 69, ns `bms`), [`workspaces.yml`](../../../ansible/playbooks/codesphere-vendorportal/workspaces.yml) (IaC workspace provisioning). Each is **preflight-gated** (a machine-readable `decision:"go"` report), takes a **deploy lock**, renders the pulled bundle, strips Ingress + crawl4ai, **provenance-stamps**, validates, and **upserts** (no `delete --all` — PVCs preserved).
- `cs_apply_split` (in `cs-env.sh`) — splits a large rendered flat YAML into per-doc, kind-ordered `cs_apply_file` calls (the 5s cap forbids one big apply).
- Guards (run on what is actually applied): [`scripts/validate-rc-blast-radius.py`](../../../scripts/validate-rc-blast-radius.py) (G1: allowed namespaces/kinds/hosts, resource budget; `--commands`/`--secrets` modes) + [`scripts/rc-stamp-manifests.py`](../../../scripts/rc-stamp-manifests.py) (G2 provenance + drop Ingress/crawl4ai). Tests under `scripts/tests/`, self-tested in CI.
- Config: `codesphere-vendorportal/{chos,bms}/install-values.example.env` + `Caddyfile.*.snippet`; per-RC reports in `codesphere-vendorportal/preflight/`; the crawl4ai exclusion is recorded in `codesphere-vendorportal/deviations/`.
- Monitoring: **Codesphere team monitoring** (no in-cluster Alloy — PSS-restricted forbids its hostPath DaemonSet).

### RC-standup gotchas (learned standing up the first bms-rc RC, 2026-06)

Beyond the four `cs exec` quirks above, the full-stack RC surfaced these. The RUNBOOK
**Troubleshooting matrix** has the symptom→fix table; this is the operator mental model.

- **`--profile default` + wake — NOT a "Multi Server Deployment" entitlement (CORRECTED 2026-06-18,
  per Codesphere).** `cs sync landscape` / `cs start pipeline` REQUIRE **`--profile default`** (the
  landscape file is `ci.default.yml`, so the profile is `default`). Without the flag, cs looks for a
  non-existent `ci.yml` and emits the **misleading** `400 … Workspace config does not have Multi
Server Deployment support` — MSD is NOT an entitlement gate. The workspace must also be **running**
  first (`cs wake-up`; an asleep on-demand workspace → `500` on sync / `400 "not in a running state"`
  on start, and the prod hosts return **429** = the slept run-stage). Working sequence (both teams):
  `cs wake-up && cs sync landscape --profile default && cs start pipeline --profile default run`.
  nix-installed `caddy` is not on the ad-hoc `cs exec` PATH — drive Caddy via the pipeline.
- **More `cs exec` flag traps.** `cs exec` (cobra) grabs the cs **global flags** `-a/-t/-v/-w/-h`
  and chokes on `--config` even _after_ `--`, so `pgrep -a caddy` or `caddy run --config X`
  print cs help instead of running. Pass the whole command as **one double-quoted string**, drop
  the offending flags (caddy auto-loads `./Caddyfile`), and write files with **base64**
  (`cs exec -w <id> -- "echo <b64> | base64 -d > Caddyfile"`) since stdin isn't forwarded.
- **vc-k8s 3-dim quota** (memory / ephemeral-storage 30Gi / PVC 20Gi). The killer: the syncer
  injects a **`vcluster-rewrite-hosts` initContainer carrying the workload's _original_ ephemeral
  limit**, so a pod's host-side ephemeral cost is `max(init, containers)` and is **uncappable
  from inside** (qdrant shows 512Mi in-vcluster but the host charges its original 6Gi). The
  workspace-plan SSD also eats ~20Gi of the 30Gi as baseline. Free quota by **dropping** optional
  components, `--cap-ephemeral`, managed-datastore offload, trimming replicas — not by capping the
  blocked pod. Also: a **StatefulSet won't roll a non-Ready/CrashLooping pod** — `kubectl delete
pod <sts>-0` to force adoption of a patched template.
- **Front door = single port, host + `/api` routing.** Caddy on `:3000` must route
  `host api.bms-rc.…` _and_ `path /api/*` → hive-server, default → hive-ui — the workbench probes
  `GET /api/auth/config` **same-origin**, so `/api` must reach the API or the bootstrap fails. See
  `codesphere-vendorportal/chos/Caddyfile.chos.snippet`.
- **Dev URLs reach only the OIDC-redirect stage.** The apps' redirect/API are pinned to the custom
  hosts; custom-domain attach is **UI-only** (`cs` has no domain command). See the RUNBOOK
  "Dev URLs vs custom domains" override matrix for the test-vs-prod values.
- **rc-stamp toolkit** (`scripts/rc-stamp-manifests.py`) is the constrained-install kit:
  `--harden-pss`, `--cap-ephemeral SIZE`, `--drop-name`, `--namespace`, `--rewrite OLD=NEW`,
  `--set-env C=NAME=VAL` (qdrant snapshots→PVC), `--set-arg C=ARG` (redis RDB-off). Datastore +
  managed-service facts live in the **[`codesphere-managed-services`](../codesphere-managed-services/SKILL.md)** skill.
- **Verify login with Playwright.** `NODE_PATH=<repo>/node_modules node` a script that opens the
  dev URL → clicks the SSO button → fills the KC form → asserts the authenticated landing
  (`/missions`). Login was proven this way for the CHOS workbench.

## Refresh an existing RC to a newer bundle — battle-tested runbook (2026-06-17/18)

A full N→N+1 refresh + the deploy-issue fixes learned doing it. The bundle is RC-agnostic at the
front door; only the **workloads** change. Work in a **git worktree** so the main checkout is
untouched; symlink the gitignored inputs (`secrets/`, `kubeconfig-*`) in. The `bms-rc-vault.yml` is
a **plaintext** vault (mode 0600, gitignored) → the deploys need **no `--ask-vault-pass`**.

```bash
# 0. pull + verify + confirm the bundle carries the upstream fix you're lifting
source ~/workspace/cognitive-hive-deploy/secrets/harbor-ro-robot.env   # read literally ($ in robot user)
oras login registry.onstackit.cloud -u "$HARBOR_RO_USERNAME" --password-stdin <<<"$HARBOR_RO_PASSWORD"
oras pull registry.onstackit.cloud/chos-delivery/chos/releases/chos-release:rc-current -o ./dl
DIGEST=$(oras resolve registry.onstackit.cloud/chos-delivery/chos/releases/chos-release:rc-current)
echo "$DIGEST" > dl/.release-digest
COSIGN_PUB=./dl/cosign.pub COSIGN_IMAGE_PUB=./dl/cosign-image.pub bash dl/delivery/verify-manifest.sh ./dl  # PASS=6
scripts/rc-bundle-inspect.sh ./dl --carries Senticor-ai/talentiq#350      # "does this bundle carry PR X?"

# 1. preflight (read-only) — generates the schema-correct decision:"go" report the playbooks gate on
CS_CFG="$PWD/secrets/codesphere.cfg.chos" CS_EXPECTED_WORKSPACE_ID=222 CS_EXPECTED_VCLUSTER_SUBSTR=k8s.rg-70 \
  scripts/cs-preflight.sh --stack chos --release-digest "$DIGEST"        # + --stack bms (cfg.bms, ws 225, rg-69)

# 2. (managed Valkey) wire + GATE: probe :6379 FROM A HIVE POD before flipping the flag
#    vault_bms_rc_valkey_url already holds the redis://:<pw>@valkey-<id>.rg-70…:6379 (plaintext vault)
CS_CFG="$PWD/secrets/codesphere.cfg.chos" CS_EXPECTED_WORKSPACE_ID=222 CS_EXPECTED_VCLUSTER_SUBSTR=k8s.rg-70 \
  scripts/cs-managed-probe.sh valkey --host valkey-<id>.rg-70.svc.cluster.local --auth <pw> --ns hive --pod deploy/hive-server

# 3. deploy CHOS (team 70) then BMS (team 69). NOTE: preflight_report MUST be an ABSOLUTE path
#    (ansible lookup('file') resolves relative to the PLAYBOOK dir, not cwd → "File not found").
source secrets/codesphere.cfg.chos
ansible-playbook ansible/playbooks/codesphere-vendorportal/chos.yml -e bundle_dir="$PWD/dl" \
  -e preflight_report="$PWD/codesphere-vendorportal/preflight/<ts>-chos-rg-70.json" \
  -e use_managed_s3=true -e use_managed_valkey=true -e cap_ephemeral=256Mi
source secrets/codesphere.cfg.bms
ansible-playbook ansible/playbooks/codesphere-vendorportal/bms.yml -e bundle_dir="$PWD/dl" \
  -e preflight_report="$PWD/codesphere-vendorportal/preflight/<ts>-bms-rg-69.json"
```

**Deploy-gate fixes you WILL hit (handle in order, all real 2026-06):**

- **Stale deploy lock** from a prior run → `A vendorportal-rc deploy lock is held`. Inspect it in the
  **stack's own namespace** (`-n hive` for CHOS via cfg.chos, `-n bms` for BMS via cfg.bms — the
  BMS lock lives in `bms`): `cs exec -- "kubectl -n <hive|bms> get cm vendorportal-rc-deploy-lock -o jsonpath={.data}"`; if stale, add **`-e break_lock=true`**.
- **DB-backup gate** on a digest change (`Live release digest differs…`). Take a real pre-upgrade
  backup first, then `-e skip_db_backup=true`:
  `cs exec -- "kubectl -n hive exec postgres-0 -c postgres -- pg_dump -Fc -U hive -d hive -f /var/lib/postgresql/data/pre-upgrade-<digest>.dump"` (the PVC is preserved across the upsert; verify with `pg_restore --list`).
- **k8s Job immutability** on redeploy (`spec.template … field is immutable` on `pg-stat-statements-init`/`hive-migrate`) — **fixed in `cs_apply_split`** (it now `cs_delete_file`s Job/CronJob before apply). No action needed; just know why those Jobs are deleted+recreated.
- **redis orphan** after `use_managed_valkey=true` — the upsert drops redis from the manifest but
  does NOT delete the live object. Remove it: `cs exec -- "kubectl -n hive delete deploy redis svc redis --ignore-not-found"`.

**Verify (prod hosts):** `cs wake-up` both workspaces, then `curl .../api/health` (200, the new
version), `show-workload-provenance.sh hive` (digest annotations + live imageIDs), and
`tests/negative-oidc-tests.sh --api … --issuer …/realms/bms-rc --client bms-rc --redirect https://bms-rc…/`
(fail-closed gate — expects 5/5; the bms-rc client enforces PKCE).

## Front-door domains + the GitLab-`opencode` IaC path

- **Domain cutover IS scriptable — confirmed live, real endpoint, exact body shape
  (2026-07-04).** `PUT /domains/team/{teamId}/domain/{domainName}/workspace-connections` with
  body `{"<path>": [<workspaceId>]}` — e.g. `{"/": [339]}` — **at the top level, not nested
  under a `"workspaces"` key**. Confirmed with a real round-trip: cut
  `builder.vendorportal.gtplatforms.org` to a disposable probe workspace (response visibly
  changed from GTC Builder's JSON to a different 404), then cut back (confirmed restored).
  Find the exact schema by fetching `<instance>/api/scalar-ui/` (with a Bearer token) and
  extracting the inline OpenAPI spec from the `Scalar.createApiReference(..., {content:
"<escaped JSON>"})` script tag — the public docs.codesphere.com pages describe this endpoint
  but omit the schema, which is why the wrong body shape was tried first.
  **The trap that produced a false "UI-only" conclusion earlier the same day:** `PATCH
/domains/team/{t}/domain/{d}` (the _plain_ domain resource, not the `/workspace-connections`
  sub-path) with `{"workspaces": {"/": [<id>]}}` returns `200 OK` and silently changes nothing
  — that's the wrong endpoint _and_ the wrong body shape (nested under `workspaces`, matching
  the `GET` response's shape, which is not what `PUT` expects). A `200 OK` that visibly changes
  nothing means "check the real schema," not "this field isn't writable." Also don't trust
  `OPTIONS` on this API as evidence a route/field is real — it's a generic CORS-preflight
  handler that returns the same permissive `Access-Control-Allow-Methods` list for paths that
  are real (`/domains/team/{t}/domain/{d}`) and paths that flat-out don't exist
  (`/workspaces/{id}/restart` — confirmed via a real `404 Cannot POST ...`, not an OPTIONS
  probe). This makes a full create→verify→cutover blue/green redesign of the GTC Builder
  deploy workflow viable — see the memory `project_gtc_builder_wake_desync` for the full
  history of this investigation.
- After DNS verify, bind each domain in **Domains → Routing**: Access **Public**, path `/` → the
  workspace — `api.`/`workbench.bms-rc` → ws **222**, bare `bms-rc` → ws **225**. Until bound,
  prod hosts 429/404 even with the run-stage up.
- **The IaC path works** (`cs wake-up && cs sync landscape --profile default`): the `opencode` repos
  `cognitive-hive-os/chos-deploy-vendorportal` + `talentiq/bms-deploy-vendorportal` (glab token in
  `secrets/glab-opencode.env` as `GLAB_OPENCODE_TOKEN`) hold the **front-door** landscape. The BMS
  group display name is now `BMS`, but the API path still resolves as `govtech-projects/talentiq`;
  do not repoint Codesphere to `govtech-projects/bms` until that path exists. `ci.default.yml` uses
  schema `v0.2` — the working one per Codesphere support; do NOT drop the wrapper.
  The CHOS Caddyfile needs the `/api/*` path rule. Mirror = `chos/bms/ci.yml` + `Caddyfile.*.snippet`.
- **Auto-update state (no, not yet):** the `opencode` repos are git-backed but Codesphere does **not
  auto-pull/redeploy on push** (the Codesphere Deploy GitHub Action is GitLab-only/deferred). The
  front door is RC-stable (proxies to services by name), so it needs no per-RC change; the **workload
  deploy stays the manual gated ansible** above. To automate "new `rc-current` → deploy" you'd add a
  trigger (poll the resolved digest, or a GitLab-CI/ARC cron) that runs the gated playbooks — there
  is no such automation today.

## CHOS+BMS app layer + senticor007 Keycloak → other skills

This skill stays focused on the Codesphere **platform** (cs-exec, IaC/landscape, quota-fit, deploy).
Two adjacent layers live elsewhere — do not re-document them here:

- **`chos-bms` skill** — the CHOS+BMS _application_ ops for this RC: the **bms-rc org-tenant seed** (the
  "Single Unlock Gate"), the `hive org`/`mission` CLI + `HIVE_TOKEN` admin-token flow, member **roles**
  (`sichter`/`prozessverantwortlicher`), the **Google-broker + reconcile** that lets all `@senticor.ai`
  staff log in, and the **Playwright e2e**. Scripts: `scripts/bms-seed.sh`,
  `scripts/bms-reconcile-staff.sh`; e2e: `codesphere-vendorportal/tests/bms-e2e.js`.
- **`keycloak` skill** — the senticor007 Keycloak (`bms-rc` realm + clients/mappers/brokers), incl. the
  **Tailscale-kubeconfig kcadm** fallback when gcloud IAP is expired.

### RC acceptance tooling (top-level `scripts/` + `tests/`)

`rc-bundle-inspect.sh` (bundle versions/SHAs + "carries PR X?"), `cs-preflight.sh` (Phase-0 report),
`cs-managed-probe.sh` (managed Valkey/PG/S3 reachability from a hive pod), `show-workload-provenance.sh`
(per-workload provenance + live image digests), `generate-least-privilege-evidence.sh`,
`generate-acceptance-report.sh` (assembles `ACCEPTANCE_REPORT.md`), `platform-validate.py
--assert-config-env K=V` (fail-closed OIDC/tenant render gate), `tests/negative-oidc-tests.sh`. Companion
docs: `REFERENCE_ARCHITECTURE.md`, `OPERATIONS_RUNBOOK.md` (incl. secret rotation), `OBSERVABILITY.md`.

## Org / team membership (API-only — no `cs` command, no self-serve UI)

Adding a person to the vendorportal is **API-only** today (per Clemens, 2026-06): `cs` has no
membership command and there's no org-level UI for non-Codesphere-staff admins. There are **two
levels — org membership is the prerequisite** (you hit `… is not a member of the organization` when
you try to add them to a project), then **per-team** membership. The existing `cs` token works as
the bearer against the REST API (`$CS_API` = `https://vendorportal.gtplatforms.org/api`; interactive
spec at `/api/scalar-ui`).

```bash
source secrets/codesphere.cfg.chos                 # CS_API + CS_TOKEN (the cs token IS the bearer)
A=(-H "Authorization: Bearer $CS_TOKEN")
# 1) orgs you're admin of  (one org: SENTICOR = e5af3a34-6a94-4195-af4c-be52931d67a7)
curl -s "${A[@]}" "$CS_API/organizations"
# 2) ORG membership (prerequisite). Field is `email`; role is a STRING "admin"|"member". Immediate.
curl -s "${A[@]}" -H 'Content-Type: application/json' -X POST \
  -d '{"email":"new.person@senticor.ai","role":"admin"}' "$CS_API/organizations/<orgId>/members"
# 3) teams (57 legacy BMS demo · 69 BMS · 70 CognitiveHive)
curl -s "${A[@]}" "$CS_API/teams"
# 4) TEAM membership. NOTE the differences: field is `userEmail` (NOT email), role is an INT
#    (0 = admin/owner, mirrors existing admins). pending=true until the invitee first logs in.
curl -s "${A[@]}" -H 'Content-Type: application/json' -X POST \
  -d '{"userEmail":"new.person@senticor.ai","role":0}' "$CS_API/teams/70/members"
curl -s "${A[@]}" "$CS_API/teams/70/members"       # verify
```

**Gotchas:** org uses `email` + **string** role; teams use **`userEmail`** + **int** role (a
`400 … 'string', got: 'undefined', at userEmail` means you sent `email`). Org add is immediate
(`pending:false`); team add is `pending:true` until the invitee first logs in at
`https://vendorportal.gtplatforms.org`.

## Manifests & related

- Manifests: [codesphere-vendorportal/kubernetes/sift-assist-pro/](../../../codesphere-vendorportal/kubernetes/sift-assist-pro/) (edit → PR → re-apply with `cs-kubectl apply` or `cs-deploy`). New service? Start from `assets/*.template.yaml`.
- Playbook: [ansible/playbooks/codesphere-vendorportal/sift-assist-pro.yml](../../../ansible/playbooks/codesphere-vendorportal/sift-assist-pro.yml).
- Related skills: [`coder`](../coder/SKILL.md) (the workspace hosting this repo), [`stackit`](../stackit/SKILL.md) (the `registry.onstackit.cloud` image source + DNS).
