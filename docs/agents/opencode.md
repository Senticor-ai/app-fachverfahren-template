# OpenCode Agent Hinweise

OpenCode-Agenten nutzen dieselben vendor-neutralen Verträge wie andere Coding
Agents:

- `AGENTS.md` als Root-Policy.
- `agent.discovery.json` als maschinenlesbarer Einstieg.
- `.agents/skills` als kanonische Skill-Quelle.
- Package-Scripts als öffentliche Befehlsoberfläche.

Tool-spezifische Dateien dürfen nur auf diese Quellen verweisen und keine
abweichenden Regeln duplizieren.
