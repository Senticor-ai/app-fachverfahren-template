# Gemini Agent Bootstrap

Gemini-oriented agents use `AGENTS.md` as the root policy and `.agents/skills`
as the canonical workflow contracts. Tool-specific files are only adapters.

Start with:

```bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover -- --json
pnpm run agent:context -- --task <app-spec> --paths <module-path> --json
```

Use the validation profile from `agent:context.validationProfiles` that matches
the current scope before reporting completion.
