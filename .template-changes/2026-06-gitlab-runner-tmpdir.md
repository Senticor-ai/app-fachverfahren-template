---
bump: patch
updateMode: review
migration: none
---

Setzt in GitLab-/opencode.de-Node-Jobs ein Build-Workspace-lokales `TMPDIR`
außerhalb des Repository-Checkouts, damit Vitest und Vite auf unprivilegierten
Kubernetes-Runnern keine Schreibrechte auf `/tmp` voraussetzen.
