import { Badge, EmptyState, PageHeader } from "@senticor/fachverfahren-kit";

export const moduleMeta = {
  domain: "dog-tax",
  label: "Hundesteuer",
};

export function CitizenScreen() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <PageHeader title={"Hundesteuer"} description="Buergerleistung" />
      <EmptyState
        title="Noch kein Antrag"
        description="Der Antrag wird aus der Leistungskonfiguration aufgebaut."
      />
    </main>
  );
}

export function CaseworkerScreen() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader
        title={"Hundesteuer"}
        description="Sachbearbeitung"
        actions={<Badge tone="info">Bereit</Badge>}
      />
      <EmptyState
        title="Noch kein Vorgang"
        description="Vorgaenge erscheinen nach Eingang oder Migration."
      />
    </main>
  );
}

export function AuditScreen() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader title={"Hundesteuer"} description="Audit" />
      <EmptyState
        title="Noch kein Audit-Nachweis"
        description="Nachweise werden vom Build- und Laufprotokoll verknuepft."
      />
    </main>
  );
}
