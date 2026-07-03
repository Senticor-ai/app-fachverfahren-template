# KI-Anbindung — Ports, Steuerung, Spracheingabe (vendor-neutral)

Das Kit bindet KI **nur über Ports** an. Es enthält **kein Modell, kein Netz,
keine Mikrofon-API** — ein Verfahren dockt in PROD seine echte KI/Transkription an
die Interfaces an, ohne eine Zeile Kit-Code zu ändern. So bleibt das offene Template
frei von Anbieter-Bindung, und die spätere Anbindung von KI-Agenten ist ein reiner
Adapter-Schritt.

## 1. Das 3-Schichten-Zustandsmodell

| Schicht       | Ort                                                             | Bedeutung                                                               |
| ------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **DATEN**     | `LeistungConfig.ki` (`assist`/`chat`/`voice`)                   | Das Verfahren _bietet_ eine Fähigkeit an + Obergrenzen.                 |
| **PRÄFERENZ** | `KiSteuerung` (`useKiSteuerung`, localStorage)                  | Der Mensch _schaltet_ Fähigkeiten an/aus, setzt Transparenz + Schwelle. |
| **RUNTIME**   | Port-Props (`kiAssistPort`, `chatPort`, `voicePort`) in der App | Die _echte_ Implementierung wird zur Laufzeit injiziert.                |

**Effektiv aktiv** = Config bietet an ∧ Präferenz ≠ aus ∧ Port injiziert.
**Effektive Autonomie-Schwelle** = `max(config, nutzer)` — der Mensch kann nur
**strenger** stellen. `KiSteuerung.humanOversight` ist im Typ `true` (unabschaltbar).

## 2. Die Ports (`lib/ai-assist.ts`, `lib/voice-input.ts`)

```ts
import {
  type KiAssistPort,
  type KiChatPort,
  createStubAiAssistPort,
  createStubChatPort,
  type VoicePort,
  createStubVoicePort,
} from "@senticor/fachverfahren-kit";
```

- `KiAssistPort.schlageVor(eingabe)` → Ergebnis mit den **5 Transparenzelementen**
  (`quelle`, `konfidenz`, `begruendung`, Kennzeichnung, `reviewErforderlich: true`).
- `KiChatPort` streamt eine Antwort als `AsyncIterable<string>` (Token-Strom).
- `VoicePort.transkribiere(audio)` + `datenschutz()` → Profil `{ onDevice, euResidenz, sendetAudio }`.

Die `createStub*`-Fabriken liefern deterministische Defaults (kein Modell/Netz) —
ideal für Stories/Demos und den vollständig klickbaren Fluss vor der echten Anbindung.

### Adapter-Beispiel (PROD)

```ts
// Der reale Broker/Dienst wird NUR hier angebunden — das Kit bleibt unverändert.
const kiAssistPort: KiAssistPort = {
  async schlageVor(eingabe) {
    const r = await meinBroker.assist(eingabe); // eigener, EU-gehosteter Dienst
    return {
      wert: r.text,
      quelle: r.modell, // "source"
      konfidenz: r.confidence, // "confidence"
      begruendung: r.rationale, // "why"
      kennzeichnung: "KI-generiert (Art. 50)", // "marking"
      reviewErforderlich: true, // Mensch entscheidet
    };
  },
};
```

## 3. EU-AI-Act-Pflichten (limited risk)

- **Kennzeichnung** (Art. 50): KI-Ausgaben sind sichtbar als „KI-generiert" markiert
  (die Panels tun das; ein Adapter darf das nicht entfernen).
- **Transparenz**: `quelle`, `konfidenz`, `begruendung` werden angezeigt.
- **Menschliche Aufsicht**: `reviewErforderlich: true` + `humanOversight: true` sind
  Literale — der Mensch nimmt an/verwirft; keine stille Autonomie unterhalb der Schwelle.
- **Override**: der Mensch kann jeden Vorschlag verwerfen/korrigieren.

## 4. Spracheingabe — Datenschutz

`createStubVoicePort` liefert `{ onDevice: true, euResidenz: true, sendetAudio: false }`.
Der `use-voice-input`-Hook ist **Consent-gated**: `start()` ist ohne erteilten Consent
ein No-Op. Es gibt **kein** `getUserMedia`/`SpeechRecognition`/`MediaRecorder` im Kit —
die Mikrofon-Erfassung besitzt der PROD-Adapter, der on-device/EU-ansässig arbeiten soll.
Transkripte füllen ein Feld nur **vor** (der Mensch bestätigt/korrigiert), kein Autosubmit.

## 5. Host-Bridge-Sicherheit

Wird eine App in einem Host (Webview/iframe) betrieben, läuft **kein KI-Datenkanal**
über `postMessage`. KI-Ein-/Ausgaben bleiben im Anwendungs-Kontext bzw. beim injizierten
Port; die Host-Bridge trägt nur UI-/Steuer-Signale, niemals Modell-Prompts oder -Antworten.

## 6. Verifikation (Kit-Reinheit)

Die KI- und Voice-Pfade binden **kein** Netz und **keine** Sprach-/Aufnahme-API:

```bash
# KI/Voice sind port-only — keine Netz-/Sprach-/Aufnahme-Bindung (Treffer nur in Kommentaren):
rg -n "fetch\(|WebSocket|EventSource|SpeechRecognition|MediaRecorder" \
   packages/fachverfahren-kit/src
```

**Eine bewusste Ausnahme:** `components/CameraCapture.tsx` nutzt
`navigator.mediaDevices.getUserMedia` — aber ausschließlich für die **Dokument-Foto**-
Aufnahme (ein separates, opt-in Bürger-Feature), **nicht** für KI oder Spracheingabe.
Der Voice-Pfad (`VoicePort`/`use-voice-input`/`VoiceInput`) besitzt selbst **keine**
`getUserMedia`-Nutzung — die Mikrofon-Erfassung liegt beim PROD-Adapter.
