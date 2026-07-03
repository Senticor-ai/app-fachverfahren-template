// fachverfahren-kit/lib/ai-assist — der GENERISCHE, vendor-neutrale PORT fuer transparente KI-ASSISTENZ + CHAT.
//
// Schwester von lib/dokument-extraktion.ts, aber allgemeiner: hier geht es um EINEN transparenten KI-Vorschlag
// zu einer Eingabe (KiAssistPort) und um eine gestreamte Assistenten-Antwort (KiChatPort). Wie beim Extraktions-
// PORT ist hier NUR die Schnittstelle + ein deterministischer Stub-Default definiert — KEIN Modell, KEIN Netz,
// KEINE platform-contracts-Abhaengigkeit. In PROD dockt ein Verfahren seine echte KI (Broker/LLM) an genau diese
// Interfaces an, ohne eine Zeile Kit-Code zu aendern. Rein (kein React/DOM), damit die Ableitung der Vorschlaege
// deterministisch testbar bleibt.
//
// TRANSPARENZ (EU-AI-Act Art. 50 · DSGVO Art. 22): jeder Vorschlag traegt die fuenf Transparenzelemente
// quelle (source) · konfidenz (confidence) · begruendung (why) · kennzeichnung (marking) und das nie
// abschaltbare Literal `reviewErforderlich: true` (der Mensch entscheidet, HITL).

/** Sichtbare Standard-Kennzeichnung als KI-Erzeugnis (EU-AI-Act Art. 50) — ueberschreibbar via Options. */
export const STANDARD_KI_KENNZEICHNUNG = "KI-generiert – bitte prüfen";

/** Die Eingabe an den Assistenz-PORT: Text/Kontext, zu dem ein Vorschlag erzeugt werden soll. Generisch —
 *  der eigentliche fachliche Inhalt kommt als DATEN vom Verfahren, der Kit traegt keine Domaenen-Literale. */
export interface KiAssistEingabe {
  /** Der Eingabetext/Kontext, zu dem der Assistent einen Vorschlag machen soll. */
  text: string;
  /** Optionaler, frei strukturierter Zusatzkontext (DATEN aus dem Verfahren; nicht interpretiert vom Kit). */
  kontext?: Readonly<Record<string, unknown>>;
}

/**
 * EIN transparenter KI-Vorschlag MIT allen fuenf Transparenzelementen. `reviewErforderlich` ist als
 * Literal `true` typisiert — die menschliche Entscheidung laesst sich im Typ nicht wegkonfigurieren (HITL).
 */
export interface KiAssistErgebnis {
  /** Der vorgeschlagene Wert/Text (frei; das Verfahren rendert/typisiert ihn an der Naht). */
  wert: string;
  /** Herkunft/Modell — Transparenzelement „source". */
  quelle: string;
  /** Konfidenz 0..1 — Transparenzelement „confidence" (als Balken UND Textwert anzuzeigen). */
  konfidenz: number;
  /** Begruendung fuer genau diesen Vorschlag — Transparenzelement „why". */
  begruendung: string;
  /** Sichtbare Kennzeichnung als KI-Erzeugnis — Transparenzelement „marking" (EU-AI-Act Art. 50). */
  kennzeichnung: string;
  /** Literal true: der Mensch entscheidet (HITL, DSGVO Art. 22) — im Typ nie abschaltbar. */
  reviewErforderlich: true;
}

/** Der PORT: nimmt eine Eingabe und liefert genau EINEN transparenten Vorschlag. Die EINE Schnittstelle, an die
 *  eine echte KI in PROD andockt; der Kit liefert nur den Stub-Default. */
export interface KiAssistPort {
  schlageVor(eingabe: KiAssistEingabe): Promise<KiAssistErgebnis>;
}

// ── Chat-PORT: gestreamte Assistenten-Antwort ────────────────────────────────────────────────────

/** Eine Nachricht im Chat-Verlauf — Rolle + Text, generisch (keine Domaenen-Antworten im Kit). */
export interface KiChatNachricht {
  /** Wer die Nachricht verfasst hat. */
  rolle: "nutzer" | "assistent";
  /** Der Textinhalt der Nachricht. */
  text: string;
}

/** Abschluss-Metadaten am Ende eines Antwort-Stroms — die Transparenzelemente „source" + „marking". */
export interface KiChatAbschluss {
  /** Herkunft/Modell — Transparenzelement „source". */
  quelle: string;
  /** Sichtbare Kennzeichnung als KI-Erzeugnis — Transparenzelement „marking" (EU-AI-Act Art. 50). */
  kennzeichnung: string;
}

/**
 * Der Antwort-Strom des Chat-PORTs: yieldet die Antwort als Text-Token (Strings) und liefert am Ende die
 * Abschluss-Metadaten als Rueckgabewert des Generators. Er IST ein `AsyncIterable<string>` (Token-Stream)
 * — die Metadaten reiten als Generator-Rueckgabe mit, sodass der Konsument nach dem letzten Token
 * `quelle` + `kennzeichnung` erhaelt (per manuellem `.next()`; `for await` liest nur die Token).
 */
export type KiChatAntwort = AsyncGenerator<string, KiChatAbschluss>;

/** Der Chat-PORT: streamt eine Assistenten-Antwort auf den bisherigen Verlauf. */
export interface KiChatPort {
  sende(verlauf: KiChatNachricht[]): KiChatAntwort;
}

// ── Stub-Defaults (deterministisch, ohne Modell/Netz) ────────────────────────────────────────────

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Ein Vorschlags-Entwurf als DATEN fuer den Stub (ohne die fixen Transparenz-Literale). */
export interface KiVorschlagEntwurf {
  wert: string;
  /** Konfidenz 0..1 (Default `standardKonfidenz`). */
  konfidenz?: number;
  begruendung?: string;
}

export interface StubAiAssistOptions {
  /** Herkunft (Transparenz „source"). Default macht sichtbar, dass kein echtes Modell laeuft. */
  quelle?: string;
  /** Sichtbare Art-50-Kennzeichnung (Transparenz „marking"). */
  kennzeichnung?: string;
  /** Statischer Default-Vorschlagstext, wenn kein `generator` greift. */
  vorschlag?: string;
  /** Default-Begruendung, wenn ein Entwurf keine eigene traegt. */
  begruendung?: string;
  /** Standard-Konfidenz, wenn ein Entwurf keine eigene traegt (Default 0.75). */
  standardKonfidenz?: number;
  /** Voller Generator (Vorrang vor `vorschlag`): leitet den Vorschlag aus der Eingabe ab. Ein String wird als
   *  reiner Wert gedeutet — so bleibt der Kit domaenenfrei (Inhalte kommen als DATEN aus Verfahren/Story). */
  generator?: (eingabe: KiAssistEingabe) => KiVorschlagEntwurf | string;
}

/**
 * Der Stub-DEFAULT des Assistenz-PORTs: deterministisch, ohne Modell, ohne Netz. Er liefert genau den
 * Vorschlag, den `generator`/`vorschlag` als DATEN vorgeben — mit allen fuenf Transparenzelementen und dem
 * fixen `reviewErforderlich: true`. Ideal, um den Fluss Eingabe → Vorschlag → menschliche Entscheidung
 * vollstaendig klickbar zu zeigen, bevor eine echte KI andockt.
 */
export function createStubAiAssistPort(
  options: StubAiAssistOptions = {},
): KiAssistPort {
  const quelle = options.quelle ?? "Stub-Assistenz (kein echtes Modell)";
  const kennzeichnung = options.kennzeichnung ?? STANDARD_KI_KENNZEICHNUNG;
  const standard = clamp01(options.standardKonfidenz ?? 0.75);
  return {
    schlageVor(eingabe) {
      const roh = options.generator
        ? options.generator(eingabe)
        : (options.vorschlag ?? "");
      const entwurf: KiVorschlagEntwurf =
        typeof roh === "string" ? { wert: roh } : roh;
      const vorschlag: KiAssistErgebnis = {
        wert: entwurf.wert,
        quelle,
        konfidenz: clamp01(entwurf.konfidenz ?? standard),
        begruendung: entwurf.begruendung ?? options.begruendung ?? "",
        kennzeichnung,
        reviewErforderlich: true,
      };
      return Promise.resolve(vorschlag);
    },
  };
}

/** Generische Standard-Antwort des Chat-Stubs, in Wort-Token zerlegt (macht Streaming sichtbar). */
const STANDARD_CHAT_CHUNKS: readonly string[] = [
  "Ich ",
  "unterstütze ",
  "Sie ",
  "hier ",
  "assistierend ",
  "– ",
  "bitte ",
  "prüfen ",
  "Sie ",
  "das ",
  "Ergebnis.",
];

export interface StubChatOptions {
  /** Herkunft (Transparenz „source"). */
  quelle?: string;
  /** Sichtbare Art-50-Kennzeichnung (Transparenz „marking"). */
  kennzeichnung?: string;
  /** Deterministische Token-Chunks, die der Strom nacheinander yieldet. */
  chunks?: string[];
  /** Leitet die Chunks aus dem bisherigen Verlauf ab (Vorrang vor `chunks`). Rein & deterministisch. */
  generator?: (verlauf: KiChatNachricht[]) => string[];
}

/**
 * Der Stub-DEFAULT des Chat-PORTs: deterministisch, ohne Modell, ohne Netz. Er yieldet die als DATEN
 * konfigurierten Token-Chunks (`generator`/`chunks`) und liefert am Ende `quelle` + `kennzeichnung`.
 * So ist der gestreamte Chat vollstaendig testbar und in Stories klickbar, bevor ein echtes Modell andockt.
 */
export function createStubChatPort(
  options: StubChatOptions = {},
): KiChatPort {
  const quelle = options.quelle ?? "Stub-Assistent (kein echtes Modell)";
  const kennzeichnung = options.kennzeichnung ?? STANDARD_KI_KENNZEICHNUNG;
  return {
    async *sende(verlauf): KiChatAntwort {
      const chunks = options.generator
        ? options.generator(verlauf)
        : (options.chunks ?? STANDARD_CHAT_CHUNKS);
      for (const chunk of chunks) {
        yield chunk;
      }
      return { quelle, kennzeichnung };
    },
  };
}
