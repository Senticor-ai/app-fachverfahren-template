# Codex Agent Bootstrap

Codex agents use `AGENTS.md` as the root policy and `.agents/skills` as the
canonical workflow contracts.

Start with:

```bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover -- --json
pnpm run agent:context -- --task <app-spec> --paths <module-path> --json
```

Follow `context.nextCommands` in order. Record executed commands in an agent
run report, then validate the final evidence with:

```bash
pnpm run agent:verify -- --task <app-spec> --report <path> --json
```
