---
name: govtech-deutschland-sdk
description: Use this skill to maintain and release the GovTech Deutschland Plattform SDK that lives in this repo at `govtech-deutschland-sdk/` and is published to STACKIT Harbor as a cosign-signed OCI artifact on merge to main. Covers adding/generalizing a `govtech-*` skill, the hard no-internal-leaks rule + scrub guard, version/CHANGELOG discipline, the build/publish/verify pipeline, and cosign key custody/rotation. Triggers — "update the govtech sdk", "add a govtech skill", "release the sdk", "bump the sdk version", "sdk scrub-check failed", "publish-govtech-sdk", "sdk cosign key", "rotate the sdk signing key", or edits under `govtech-deutschland-sdk/` or `.github/workflows/publish-govtech-sdk.yml`. NOT for using the SDK in a vendor repo (that is the shipped SDK's own `govtech-*` skills).
metadata:
  author: Senticor-ai/infrastructure
  version: "1.0"
---

# govtech-deutschland-sdk (maintainer skill)

How to evolve and release the **GovTech Deutschland Plattform SDK** from inside this repo.
The SDK source of truth is `govtech-deutschland-sdk/`; the publish pipeline is
`.github/workflows/publish-govtech-sdk.yml`. The customer runbook is in
[`docs/govtech-sdk/maintaining.md`](../../../docs/govtech-sdk/maintaining.md).

This skill is INTERNAL (it may reference issues, internal product names, etc.). The SDK
content it governs must NOT — see the hard rule below.

## The architecture in one paragraph

The SDK is a generalized, externally-safe projection of this repo's internal skills
(`codesphere-vendorportal`, `codesphere-managed-services`, `keycloak`, `grafana`, …). Its
centerpiece is the agent-agnostic deploy contract `core/platform-validate.py`, enforced at
three call sites (agent loop, git pre-commit, CI). On merge to main the workflow builds a
`tar.gz` (+ SBOM + checksums + `cosign.pub`), cosign-signs it, and `oras push`es it to the
PUBLIC Harbor project `senticor/govtech-deutschland-sdk`. External companies pull it
anonymously and verify offline against the committed `cosign.pub`.

## HARD RULE — no internal references in the bundle

Everything under `govtech-deutschland-sdk/` ships to external companies. It must never
contain: issue/PR refs (`#NNN`), internal tenant/product names (`bms`, `talentiq`,
`cognitive-hive`, `sift-assist-pro`, `vendorportal`, `gtplatforms`), workspace/team ids
(`workspace 149`, `team 57`, `rg-57`), internal hostnames (`senticor00X`), the infra repo
path (`Senticor-ai/infrastructure`), secret paths (`secrets/`, `vault_`), or
contributor-local paths (`/Users/…`). `scripts/scrub-check.sh` enforces this and runs in the
publish workflow — but run it locally before every commit:

```
bash govtech-deutschland-sdk/scripts/scrub-check.sh
```

`registry.onstackit.cloud` and the publishing org name are PUBLIC and intentionally allowed.

## Add or generalize a `govtech-*` skill

1. Create `govtech-deutschland-sdk/skills/govtech-<name>/SKILL.md` with frontmatter:
   `name`, `description` (with trigger phrases), `metadata.author:
Senticor-ai/govtech-deutschland-sdk`, `metadata.version`.
2. Write generalized content — strip every internal identifier; describe patterns, not our
   specific deployment. Add a `PROVENANCE.md` noting the internal source ("derived and
   generalized; authored independently").
3. If it adds new agent-relevant guidance, mention it in `core/AGENTS.md.template` and
   `skills/govtech-sdk-core/SKILL.md`.
4. `bash govtech-deutschland-sdk/scripts/scrub-check.sh` (must pass — checks frontmatter too).
5. The installer auto-discovers `skills/govtech-*`, so Claude Code (`.claude/skills/`) and
   Cursor (`.cursor/rules/*.mdc`) pick it up with no installer change.

## Generalizing the validator

`core/platform-validate.py` keeps all logic from the internal source plus `--registry`
(overridable sanctioned registry) and the env var `PLATTFORM_REGISTRY`. If you change rules,
update `core/tests/test-platform-validate.sh` + fixtures and keep the docstring examples
neutral (no `bms`/workspace ids). Run:

```
bash govtech-deutschland-sdk/core/tests/test-platform-validate.sh
ruff check govtech-deutschland-sdk/core/platform-validate.py
```

## Cut a release

1. Edit `govtech-deutschland-sdk/VERSION` (SemVer) and add a matching top entry to
   `CHANGELOG.md` (the build asserts `VERSION == CHANGELOG top == build arg`).
2. `bash govtech-deutschland-sdk/scripts/build-bundle.sh $(cat govtech-deutschland-sdk/VERSION)`
   then `bash govtech-deutschland-sdk/scripts/verify-bundle.sh govtech-deutschland-sdk/dist`
   (local mode). Clean `dist/` afterwards (gitignored).
3. Open a PR; on merge to main the publish workflow runs end-to-end and the final step
   clean-room-verifies the published artifact. There is no manual publish step.

## cosign key custody & rotation

The SDK signing keypair is SDK-dedicated (NOT the CHOS image-signing key — keeps the two
release trains decoupled and lets externals verify offline). Private key + password are repo
secrets `COSIGN_PRIVATE_KEY` / `COSIGN_PASSWORD`; the public key is committed at
`govtech-deutschland-sdk/cosign.pub` and fingerprinted in `TRUST.md`. Provision/rotate with
the same approach as `ansible/playbooks/cosign-signing-key.yml`; full procedure in
[`docs/govtech-sdk/cosign-key-custody.md`](../../../docs/govtech-sdk/cosign-key-custody.md).

## Gotchas

- **cosign v2 vs v3 flags.** v3 needs `--use-signing-config=false`; the legacy detached
  `.sig` needs `--new-bundle-format=false --output-signature`. The workflow + roundtrip test
  add flags conditionally on `--help`. Verify offline with `--signature … --insecure-ignore-tlog`.
- **`oras repo tags` omits `.sig`.** Fetch the `sha256-<digest>.sig` manifest directly to inspect it.
- **Harbor project must be PUBLIC** for anonymous external pull (Phase-0 prerequisite).
- **Maintainer surface stays out of the bundle.** This skill (`.claude/skills/…`) and
  `docs/govtech-sdk/` live OUTSIDE `govtech-deutschland-sdk/`, so `build-bundle.sh` (which
  tars only the SDK dir) never ships them. `verify-bundle.sh` asserts this.
