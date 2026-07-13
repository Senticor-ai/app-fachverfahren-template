# Compliance Evidence

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für Evidence-Plan und Build; fachliche Freigaben bleiben Aufgabe
> der verantwortlichen Behörde.
> Quellen: `packages/conformance-kit`, `scripts/evidence-build.mjs`,
> `docs/compliance/profile.de.example.json`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Die Vorlage ist compliance-ready, nicht automatisch compliant. Die
verantwortliche Behörde muss Rechtsgrundlagen, Schutzbedarf, Aufbewahrung,
Löschung und organisatorische Kontrollen festlegen und freigeben.

Das Evidence-Bundle soll mindestens enthalten:

- System- und Datenflussdiagramme
- Threat Model
- Verzeichnis der Verarbeitungstätigkeiten als Entwurf
- DSFA-Vorprüfung
- TOM- und Kontrollmatrix
- Aufbewahrungs- und Löschkonzept
- BSI-IT-Grundschutz-Mapping
- C5-Providerverweise
- SBOM, Lizenzbericht und Build Provenance
- Container- und Kubernetes-Policy-Ergebnisse
- API- und Event-Katalog
- Barrierefreiheitsbericht und Erklärungsentwurf
- Backup- und Restore-Test
- Migrations- und Rollback-Nachweise

`pnpm run evidence:build` erzeugt den ersten maschinenlesbaren Plan aus
`docs/compliance/profile.de.example.json`.

## Externe Template-Evaluation

Für Vergleichs- oder Abnahmeversuche werden mindestens diese Kriterien
festgehalten:

- Zeit bis zur ersten lauffähigen vertikalen Scheibe.
- Anteil generierter zu handgeschriebener Infrastruktur.
- notwendige Änderungen an Kernpaketen.
- Adapter-Contract-Test und Upgrade von der vorherigen SDK-Version.
- Vollständigkeit des Evidence-Bundles.
- erfolgreicher Rollback, Restore und Providerwechsel ohne Fachcode-Änderung.

Geeignete Szenarien sind ein Greenfield-Bürgerantrag mit interner
Sachbearbeitung, ein Erlaubnisverfahren mit Anlagen und Vier-Augen-Freigabe,
ein Verfahren ohne Zahlung mit externem Nachweisabruf, eine
SQL-Server-Migration über Babelfish und ein zweiter Jurisdiction-Pack.
