# Validierungsbrief: Hundesteuer

Dieser Brief validiert die Vorlage. Er darf keine Hundesteuer-Fachlogik in den
Template-Runtime-Code zurueckkopieren.

Aufgabe fuer einen externen Coding Agent:

Baue aus dieser Plattform ein Buergerportal und ein internes Fachverfahren fuer
Hundesteuer als Domain-Modul. Nutze `modules/dog-tax/` und ein
`domain.module.yaml`. Aendere Kernpakete nur, wenn ein echter Plattformvertrag
fehlt.

Nutze die generischen UX/UI-Regeln aus
`docs/ux-ui/fachverfahren-ux-contract.md`. Hundesteuer-spezifische Werte,
Fristen, Rechtsverweise und Berechnungen muessen im Domain-/Regelmodul liegen,
nie in Template- oder Plattformcode.

Zu pruefen:

- Domain-Modul ist vollstaendig manifestiert.
- Screen Contracts liegen fuer Buergerportal, Sachbearbeitung und Audit vor.
- Storybook-Stories zeigen Default, Empty, Error und Accessibility-relevante
  Zustaende.
- Buergerportal und Caseworker-Ansicht nutzen `public-sector-ui`.
- Zahlung laeuft ueber `PaymentPort`, nicht direkt gegen Provider-Code.
- Postfach-Kommunikation laeuft ueber `MailboxPort`.
- Fachliche Audit-Events werden modelliert.
- Vier-Augen-Entscheidung ist serverseitig autorisiert.
- Rechtsgrundlagen, Datenkategorien und Retention stehen im Compliance-Profil.
- Kubernetes-Manifeste bleiben generisch und provider-portabel.
- Kein Hundesteuer-Code landet ausserhalb des Domain-Moduls, ausser in
  Validierungs- oder Testartefakten.
