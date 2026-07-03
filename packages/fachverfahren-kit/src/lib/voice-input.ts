// fachverfahren-kit/lib/voice-input — der GENERISCHE, vendor-neutrale Sprach-Transkriptions-PORT.
//
// Spracheingabe (Diktat) als transparente, EINWILLIGUNGS-gebundene Assistenz: gesprochene Sprache wird zu Text, den
// der Mensch VOR der Übernahme prüft und bestätigt — analog zur KI-Extraktion (siehe dokument-extraktion.ts). Hier ist
// NUR der PORT definiert: das Interface + ein deterministischer Stub-Default. KEINE Browser-Sprach-API
// (kein SpeechRecognition/getUserMedia/MediaRecorder), kein externer Dienst hartverdrahtet (öffentlich/vendor-neutral).
// In PROD dockt ein Verfahren seine echte Transkription — bevorzugt on-device, sonst EU-gehostet — an dieses Interface
// an, ohne eine Zeile Kit-Code zu ändern. Rein (kein React/DOM), damit die Ableitung deterministisch testbar ist.

/** Datenschutz-Eigenschaften der Transkriptions-Quelle — für die transparente Anzeige (on-device / EU / Audio-Versand).
 *  Trägt die Aussage, WO und WIE die Stimme verarbeitet wird, damit der Mensch informiert einwilligen kann. */
export interface VoiceDatenschutzProfil {
  /** True, wenn die Transkription lokal auf dem Gerät läuft (kein Server, keine Übertragung). */
  onDevice: boolean;
  /** True, wenn eine serverseitige Verarbeitung ausschließlich in der EU stattfindet (Datenresidenz). */
  euResidenz: boolean;
  /** True, wenn Audiodaten das Gerät verlassen (an einen Dienst gesendet werden). */
  sendetAudio: boolean;
}

/** Deskriptor der Audio-Eingabe. Der Kit erfasst KEIN Audio selbst; ein PORT-Adapter in PROD besitzt die Erfassung
 *  (Mikrofon-Zugriff) und deutet diesen Deskriptor bzw. eigene Puffer. Rein informativ — keine Roh-Audio-Bindung im Kit. */
export interface VoiceAudioEingabe {
  /** Dauer der Aufnahme in Millisekunden (informativ). */
  dauerMs?: number;
  /** MIME-Typ der Audiodaten, z. B. "audio/webm" (informativ). */
  mimeTyp?: string;
  /** Größe der Audiodaten in Bytes (informativ). */
  groesse?: number;
}

/** Das Ergebnis einer (abgeschlossenen) Transkription: Text + Transparenz (Konfidenz + Quelle). */
export interface VoiceTranskript {
  /** Der erkannte Text — NIE autonom bindend; der Mensch bestätigt/korrigiert vor der Übernahme. */
  text: string;
  /** Konfidenz 0..1 (optional) — Transparenzelement „confidence". */
  konfidenz?: number;
  /** Herkunft/Modell — Transparenzelement „source" (z. B. „On-Device", „Stub"). */
  quelle: string;
}

/** Ein Zwischenergebnis des Live-Diktats: der bisher erkannte (kumulative) Text + ob er final ist. */
export interface VoiceTeilergebnis {
  /** Der bisher erkannte Text (kumulativ gedacht — jeder Schritt enthält den bisherigen Stand). */
  text: string;
  /** True, wenn dieses Ergebnis final ist (kein weiteres Nachreichen folgt). */
  final: boolean;
}

/**
 * Der PORT: eine Batch-Transkription (`transkribiere`) als authoritative Ergebnisquelle, optional ein
 * Live-Diktat-Strom (`hoere`) NUR zur Anzeige während des Sprechens, plus das Datenschutzprofil der Quelle.
 * Die EINE Schnittstelle, an die eine echte Transkription in PROD andockt; der Kit liefert nur den Stub-Default.
 */
export interface VoicePort {
  /** Transkribiert eine (abgeschlossene) Audio-Eingabe zu Text — die authoritative Quelle des Endergebnisses. */
  transkribiere(audio: VoiceAudioEingabe): Promise<VoiceTranskript>;
  /** OPTIONAL: Live-Diktat als Strom kumulativer Zwischenergebnisse (nur zur Anzeige während des Hörens). */
  hoere?(): AsyncIterable<VoiceTeilergebnis>;
  /** Datenschutz-Eigenschaften der Quelle — für die transparente Anzeige (on-device / EU / Audio-Versand). */
  datenschutz(): VoiceDatenschutzProfil;
}

/** Optionen des Stub-PORTs — alles DATEN, damit der Kit domänenfrei bleibt (kein Wert im Kit-Code hartkodiert). */
export interface StubVoiceOptions {
  /** Beispiel-Endtext, den `transkribiere` liefert. Default: generischer, domänenfreier Diktat-Platzhalter. */
  text?: string;
  /** Konfidenz des Ergebnisses 0..1 (Default 0.9; wird auf 0..1 gekappt). */
  konfidenz?: number;
  /** Herkunft (Transparenz „source"). Default macht sichtbar, dass kein echtes Modell läuft. */
  quelle?: string;
  /** Überschreibt Teile des Datenschutzprofils; Default = { onDevice: true, euResidenz: true, sendetAudio: false }. */
  datenschutz?: Partial<VoiceDatenschutzProfil>;
  /** Optionale, explizite (kumulativ gedachte) Chunks für den Live-Strom `hoere()`. Fehlt dies, wird der Endtext
   *  wortweise als kumulativer Strom abgeleitet — deterministisch, ohne Timer. */
  chunks?: string[];
  /** Voll eigener Generator (Vorrang vor `text`) — leitet das Ergebnis deterministisch aus dem Deskriptor ab. */
  generator?: (audio: VoiceAudioEingabe) => {
    text: string;
    konfidenz?: number;
  };
}

/** Datenschutz-Default des Stubs: strengste, privatsphäre-freundliche Annahme (lokal, kein Versand). */
const DEFAULT_DATENSCHUTZ: VoiceDatenschutzProfil = {
  onDevice: true,
  euResidenz: true,
  sendetAudio: false,
};

/** Generischer, domänenfreier Platzhalter-Text des Stubs (kein fachliches Beispiel-Datum). */
const STUB_PLATZHALTER =
  "Dies ist eine diktierte Beispiel-Eingabe. Bitte prüfen und bestätigen Sie den Text vor der Übernahme.";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Leitet aus einem Text einen kumulativen Wort-für-Wort-Strom ab (deterministisch, ohne Timer/DOM). */
function kumulativeChunks(text: string): string[] {
  const worte = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let akkumuliert = "";
  for (const wort of worte) {
    akkumuliert = akkumuliert ? `${akkumuliert} ${wort}` : wort;
    out.push(akkumuliert);
  }
  return out.length > 0 ? out : [text];
}

/** Streamt vorgegebene Chunks als Zwischenergebnisse; der letzte Chunk ist `final`. Deterministisch, ohne Timer. */
async function* streameChunks(
  chunks: string[],
): AsyncGenerator<VoiceTeilergebnis> {
  for (let i = 0; i < chunks.length; i++) {
    yield { text: chunks[i] ?? "", final: i === chunks.length - 1 };
  }
}

/**
 * Der Stub-DEFAULT des Sprach-PORTs: deterministisch, ohne Modell, ohne Netz, ohne Mikrofon. `transkribiere` liefert
 * den konfigurierten (oder per `generator` abgeleiteten) Text; `hoere` streamt kumulative Zwischenergebnisse; das
 * Datenschutzprofil meldet standardmäßig on-device ohne Audio-Versand. Ideal, um den Fluss
 * Einwilligung → Hören → Verarbeiten → Vorschlag → Bestätigung vollständig klickbar zu zeigen, bevor eine echte
 * Transkription andockt — der Kit bleibt domänenfrei (Werte kommen als DATEN aus dem Verfahren/der Story).
 */
export function createStubVoicePort(options: StubVoiceOptions = {}): VoicePort {
  const quelle = options.quelle ?? "Stub-Transkription (kein echtes Modell)";
  const text = options.text ?? STUB_PLATZHALTER;
  const standardKonfidenz = clamp01(options.konfidenz ?? 0.9);
  const profil: VoiceDatenschutzProfil = {
    ...DEFAULT_DATENSCHUTZ,
    ...options.datenschutz,
  };
  const chunks = options.chunks ?? kumulativeChunks(text);

  return {
    transkribiere(audio) {
      const treffer = options.generator
        ? options.generator(audio)
        : { text, konfidenz: standardKonfidenz };
      const ergebnis: VoiceTranskript = {
        text: treffer.text,
        konfidenz: clamp01(treffer.konfidenz ?? standardKonfidenz),
        quelle,
      };
      return Promise.resolve(ergebnis);
    },
    hoere() {
      return streameChunks(chunks);
    },
    datenschutz() {
      return profil;
    },
  };
}
