---
bump: patch
updateMode: review
migration: none
---

Setzt in GitLab-/opencode.de-Node-Jobs ein Build-Workspace-lokales `TMPDIR`
außerhalb des Repository-Checkouts und erhöht das Timeout der Template-Tests,
damit Vitest und Vite auf unprivilegierten Kubernetes-Runnern keine
Schreibrechte auf `/tmp` und keine schnellen Full-Repo-Scaffold-Kopien
voraussetzen.
