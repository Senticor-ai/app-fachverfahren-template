# Deutschland-Stack und D-Stack-Fähigkeiten

Die Vorlage modelliert D-Stack-Basisdienste als stabile Capability-Ports statt
als generische Proxy-Endpunkte. Dadurch bleibt Fachlogik von konkreten
Integrationen entkoppelt.

| Capability-Port          | Erster Deutschland-Bezug                         |
| ------------------------ | ------------------------------------------------ |
| `IdentityAndTrustPort`   | OIDC, BundID/DeutschlandID, später EUDI Wallet   |
| `DataExchangePort`       | FIT-Connect                                      |
| `EvidenceRetrievalPort`  | NOOTS mit EU-OOTS-kompatiblem Modell             |
| `PaymentPort`            | XBezahldienste                                   |
| `MailboxPort`            | ZaPuK-kompatibler Vertrag und Übergangsadapter   |
| `AuthorityDirectoryPort` | DVDV oder passendes Behördenverzeichnis          |
| `SignatureSealPort`      | eIDAS-kompatible Signaturen, Siegel, Validierung |
| `RecordsManagementPort`  | DMS, eAkte, Archiv                               |

Deutschland ist ein Jurisdiction-Pack unter `jurisdictions/de`, nicht ein
globales `if (country === "DE")` im Anwendungscode.

## Standards und Evidenz

Das Conformance-Kit sammelt prüfbare Nachweise für API-First,
Kubernetes-Portabilität, IaC, Policy as Code, SBOM, OWASP-orientierte Tests,
BSI-IT-Grundschutz-Mapping, C5-Providerverweise und
Barrierefreiheitsnachweise. Es verspricht keine automatische Compliance.
