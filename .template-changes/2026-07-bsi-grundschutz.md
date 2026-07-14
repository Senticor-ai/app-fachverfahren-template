---
bump: minor
updateMode: review
migration: none
---

# BSI-IT-Grundschutz-Mapping + prüffähiges Gate

Neu: `docs/security/bsi-grundschutz.md` — ein versioniertes Baustein→Anforderung→**Beleg**
→Status→Lücke-Mapping (ORP.4, APP.3.1, CON.3, CON.2, CON.8, SYS.1.6, OPS.1.1.5/DER.1, CON.1 …)
mit ehrlichem Status (`erfüllt`/`teilweise`/`offen`) und Cutover-Hinweisen — statt des bisher
leeren Checklisten-Items. Ein generiertes Fachverfahren erbt die als _erfüllt_ markierten
Kontrollen; offene Punkte sind vor Produktivbetrieb zu schließen (kein Compliance-Versprechen).

Neues Gate `check:bsi-grundschutz` (`scripts/check-bsi-grundschutz.mjs`, in `precommit:check`):
prüft Version/Stand, Mindest-Abdeckung und — der Kern — dass **jeder in der Beleg-Spalte
zitierte Repo-Pfad tatsächlich existiert** (kein Overclaiming; ein Mapping darf keine Kontrolle
mit nicht existierendem Beleg behaupten). Rein statisch, kein Domänen-Wissen. Neue Bausteine
werden einfach im Dokument mit echtem Beleg ergänzt.
