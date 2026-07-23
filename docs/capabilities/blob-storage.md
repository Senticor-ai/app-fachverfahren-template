# Capability: blob-storage

Verwende `BlobStoragePort` für den **Byte-Transfer** von Nachweisen/Dokumenten
(Upload/Download). Die übrigen Ports tragen nur `AttachmentRef` — eine Referenz
(id, Dateiname, MIME-Typ, Größe, SHA-256), aber keinen Inhalt. Dieser Port
schließt die Lücke: den echten Inhalt bewegt sonst niemand.

- `put(context, { fileName, mimeType, bytes })` → `AttachmentRef`. **Größe und
  SHA-256 berechnet der Server über die Bytes** — nie vom Client behauptet; die
  Prüfsumme ist das Integritäts-Token.
- `get(context, attachmentId)` → `{ ref, bytes }`; unbekannte Kennung → sauberes
  `capabilityFailure` (kein leerer Erfolg).

## Austauschbare Backends

Eine Impl ist substituierbar, sobald sie `blobStorageContractScenarios`
(`@senticor/platform-contracts`) besteht — der Byte-Roundtrip erhält die Bytes
exakt, die Prüfsumme stimmt über die gelieferten Bytes. Mitgeliefert ist der
In-Memory-Fake (`createLocalBlobStoragePort`); ein echter Adapter (Dateisystem,
S3-kompatibler Objekt-Store) implementiert denselben Vertrag.

## Erweiterungspunkte

- `storage-backend` — wohin die Bytes wandern (Memory/FS/Objekt-Store).
- `retention-policy` — wie lange Anlagen aufbewahrt werden (DSGVO Art. 17).
- `virus-scan` — optionale Prüfung vor der Freigabe (server-autoritativ).
