---
bump: patch
updateMode: review
migration: none
---

Setzt in GitLab-/opencode.de-Node-Jobs Build-Workspace-lokale `PNPM_HOME`- und
`TMPDIR`-Verzeichnisse außerhalb des Repository-Checkouts, ignoriert pnpm- und
Build-Artefakte bei Full-Repo-Kopien und erhöht das Timeout der Template-Tests,
damit Vitest und Vite auf unprivilegierten Kubernetes-Runnern keine
Schreibrechte auf `/tmp` und keine schnellen Full-Repo-Scaffold-Kopien
voraussetzen. Stellt außerdem sicher, dass der Kubernetes-Rendercheck mit
POSIX `sh` statt Bash läuft.
