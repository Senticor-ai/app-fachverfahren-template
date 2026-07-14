import { Banner } from "@senticor/fachverfahren-kit";

export function DemoModeBanner(): React.JSX.Element {
  return (
    <Banner variant="info" title="Demo-Modus" className="m-4 mb-0">
      Diese Umgebung dient der Erprobung — bitte keine echten personenbezogenen
      Daten eingeben.
    </Banner>
  );
}
