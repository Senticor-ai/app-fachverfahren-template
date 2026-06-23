# Compliance Evidence

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
