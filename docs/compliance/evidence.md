# Compliance Evidence

Die Vorlage ist compliance-ready, nicht automatisch compliant. Die
verantwortliche Behoerde muss Rechtsgrundlagen, Schutzbedarf, Aufbewahrung,
Loeschung und organisatorische Kontrollen festlegen und freigeben.

Das Evidence-Bundle soll mindestens enthalten:

- System- und Datenflussdiagramme
- Threat Model
- Verzeichnis der Verarbeitungstaetigkeiten als Entwurf
- DSFA-Vorpruefung
- TOM- und Kontrollmatrix
- Aufbewahrungs- und Loeschkonzept
- BSI-IT-Grundschutz-Mapping
- C5-Providerverweise
- SBOM, Lizenzbericht und Build Provenance
- Container- und Kubernetes-Policy-Ergebnisse
- API- und Event-Katalog
- Barrierefreiheitsbericht und Erklaerungsentwurf
- Backup- und Restore-Test
- Migrations- und Rollback-Nachweise

`pnpm run evidence:build` erzeugt den ersten maschinenlesbaren Plan aus
`docs/compliance/profile.de.example.json`.
