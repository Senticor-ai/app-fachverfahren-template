# Claude Compatibility

Die kanonischen Agentenregeln stehen in `AGENTS.md` und `.agents/skills`.
Dieses Dokument und `.claude/skills/*/SKILL.md` sind nur
Kompatibilitätshinweise für Claude-orientierte Werkzeuge.

Starte mit Package-Script `agent:bootstrap -- --json`, danach
`agent:discover -- --json`, und wähle anschließend mit Package-Script
`agent:context` die aufgabenspezifischen Instruktionen.
