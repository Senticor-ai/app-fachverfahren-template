---
bump: minor
updateMode: auto
migration: none
---

Die geteilten Runtime-Pakete (`packages/*/**`) sind jetzt template-verwaltet
(`replace`). Vorher hatten sie KEINEN Ownership-Eintrag: `template:update`
erneuerte z.B. `apps/*/server/**`, ließ die Pakete aber stillschweigend auf dem
Scaffold-Stand — ein Vorlagen-PR, der Server-Code und Paket-API im Gleichschritt
ändert (wie #27, Secure Workforce Workspace), brach damit jeden bestehenden
Konsumenten mit TS-Fehlern gegen die alte Paket-API (`AuditStore`,
`UserAccount.role`, … — Demo-Consumer-Deploy-Run 29241279544). Bestehende
Konsumenten erhalten den Eintrag automatisch über den Ownership-Defaults-Merge
(#24/#26); wer ein Paket bewusst forkt, setzt es in `.template/ownership.yaml`
auf `consumer`.

Als Ratsche dagegen prüft ein neuer Paritäts-Test (`ownership-parity.test.ts`),
dass JEDE gescaffoldete Datei eine explizite Update-Entscheidung hat —
Ownership-Eintrag, kuratierter merge-Kandidat oder dokumentierter Opt-out.
Bekannte, bewusst un-verwaltete Pfade (u.a. `apps/*/src/**`,
`jurisdictions/*/**`, `.claude/skills/**`) sind dort mit Begründung gelistet.
