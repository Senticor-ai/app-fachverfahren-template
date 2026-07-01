# OpenCode Agent Hinweise

OpenCode-Agenten nutzen dieselben vendor-neutralen Verträge wie andere Coding
Agents:

- `AGENTS.md` als Root-Policy.
- `agent.discovery.json` als maschinenlesbarer Einstieg.
- `.agents/skills` als kanonische Skill-Quelle.
- Package-Scripts als öffentliche Befehlsoberfläche.

Tool-spezifische Dateien dürfen nur auf diese Quellen verweisen und keine
abweichenden Regeln duplizieren.

Empfohlener Ablauf:

```bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover -- --json
pnpm run agent:context -- --task <app-spec> --paths <module-path> --json
```

Danach `context.nextCommands` und `context.validationProfiles` verwenden. Vor
Abschluss `pnpm run agent:verify -- --task <app-spec> --json` ausführen oder
einen vorhandenen Agentenbericht mit `--report <path>` prüfen.
