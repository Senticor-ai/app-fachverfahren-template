// injection-scan — eine PURE, browser-neutrale Heuristik gegen PROMPT-INJEKTION in frei-formigem Text, der
// an ein Sprachmodell weitergereicht wird (z.B. Aktenvermerk-Zellen, die ein KI-Agent als Kontext liest).
// Das agentische Blackboard ist ein geteilter Arbeitsraum: schriebe jemand „Ignoriere alle Anweisungen …"
// in eine Zelle, könnte ein lesender Agent gekapert werden. Diese erste Verteidigungslinie MARKIERT
// verdächtige Muster, damit der Aufrufer sie neutralisiert, bevor sie das Modell erreichen.
//
// EHRLICH: Heuristik, KEINE Garantie — ein entschlossener Angreifer umgeht Muster. Sie senkt das Risiko
// niederschwelliger Injektion und ist die Template-Entsprechung zu `scanInjection`/`taint` der PROD-Laufzeit.
// REIN: kein Date/Random/DOM/node — deterministisch aus dem Text.

const INJECTION_PATTERNS: readonly RegExp[] = [
  // Englisch
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts?|rules?)/i,
  /disregard\s+(the\s+)?(above|previous|prior)/i,
  /you\s+are\s+now\b/i,
  /new\s+(instructions?|system\s+prompt)/i,
  /system\s*prompt/i,
  /\bact\s+as\b/i,
  /\bjailbreak\b/i,
  // Deutsch
  /ignoriere\s+(alle\s+)?(vorherigen|obigen|bisherigen)\s+(anweisungen|befehle|regeln)/i,
  /vergiss\s+(alles|die\s+anweisungen|alle\s+regeln)/i,
  /du\s+bist\s+(ab\s+)?jetzt\b/i,
  /neue\s+anweisungen?/i,
  // Rollen-/Steuermarker (ChatML-artig oder Rollen-Präfix am Zeilenanfang)
  /<\|[^|]*\|>/,
  /^\s*(system|assistant|user)\s*:/im,
];

export interface InjectionScanResult {
  /** true = mindestens ein verdächtiges Muster gefunden. */
  suspicious: boolean;
  /** Die Quell-Strings der getroffenen Muster (für Audit/Diagnose). */
  matched: string[];
}

/** Prüft frei-formigen Text auf niederschwellige Prompt-Injektions-Muster. Rein, deterministisch. */
export function scanInjection(text: string): InjectionScanResult {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) matched.push(pattern.source);
  }
  return { suspicious: matched.length > 0, matched };
}
