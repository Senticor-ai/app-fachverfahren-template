# Deutschland-Stack und D-Stack-Faehigkeiten

Die Vorlage modelliert D-Stack-Basisdienste als stabile Capability-Ports statt
als generische Proxy-Endpunkte. Dadurch bleibt Fachlogik von konkreten
Integrationen entkoppelt.

| Capability-Port          | Erster Deutschland-Bezug                         |
| ------------------------ | ------------------------------------------------ |
| `IdentityAndTrustPort`   | OIDC, BundID/DeutschlandID, spaeter EUDI Wallet  |
| `DataExchangePort`       | FIT-Connect                                      |
| `EvidenceRetrievalPort`  | NOOTS mit EU-OOTS-kompatiblem Modell             |
| `PaymentPort`            | XBezahldienste                                   |
| `MailboxPort`            | ZaPuK-kompatibler Vertrag und Uebergangsadapter  |
| `AuthorityDirectoryPort` | DVDV oder passendes Behoerdenverzeichnis         |
| `SignatureSealPort`      | eIDAS-kompatible Signaturen, Siegel, Validierung |
| `RecordsManagementPort`  | DMS, eAkte, Archiv                               |

Deutschland ist ein Jurisdiction-Pack unter `jurisdictions/de`, nicht ein
globales `if (country === "DE")` im Anwendungscode.

## Standards und Evidenz

Das Conformance-Kit sammelt pruefbare Nachweise fuer API-First,
Kubernetes-Portabilitaet, IaC, Policy as Code, SBOM, OWASP-orientierte Tests,
BSI-IT-Grundschutz-Mapping, C5-Providerverweise und
Barrierefreiheitsnachweise. Es verspricht keine automatische Compliance.
