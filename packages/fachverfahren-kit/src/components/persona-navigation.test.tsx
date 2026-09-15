// A SEAM THAT NAMES ITS OWN WORKSPACES MUST BE ALLOWED TO NAME THEIR NAVIGATION TOO.
//
// THE CASE, measured 2026-09-09 on the fourth generated use case (an INTERNAL PURCHASING application — a
// business process: no administrative act, no citizen, no legal remedy). Its seam carries the right words:
// `personas: [{ key: "buerger", label: "Bedarfsträger:in", … }]`, deterministically derived by the factory
// from the domain concept, and the workspace switcher renders them. The sidebar right underneath did not:
// «Start · Antrag stellen · Meine Anträge · Postfach». Those words were literals inside `navFor`, reachable
// through no seam at all. So the one screen meant to PROVE genericity told the user he was filing a citizen
// application.
//
// WHAT THIS WITNESS MEASURES is the thing, not the string: it renders the real `FachverfahrenShell` to markup
// and reads back the words a user would see in the sidebar — as an EXACT, ORDERED list, never as a substring
// (a `not.toContain("Akten")` is false the moment the replacement reads «Vergabe-Akten»; that trap fired here
// on the first run). It carries a positive control (can it read nav words at all, and are they today's?), a
// tautology lock (a declared word must differ from the default it replaces), a key lock (an override renames
// exactly the entry it names, nothing else) and a fail-open lock (a seam that declares nothing renders
// identically — every existing application stays untouched).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FachverfahrenShell } from "./FachverfahrenShell.js";
import type { PersonaDescriptor } from "./PersonaSwitcher.js";
import type { LeistungConfig } from "../types.js";

/** The generic administrative words the shell has always shown — written out HERE, on purpose, so this
 *  witness never reads its expectation out of the file it judges (tautology lock). */
const TODAY_CITIZEN = [
  "Start",
  "Antrag stellen",
  "Meine Anträge",
  "Postfach",
  "Boards",
] as const;
const TODAY_CASEWORKER = [
  "Eingangskorb",
  "Akten",
  "Register",
  "Assistent",
  "Boards",
] as const;
const TODAY_OVERSIGHT = ["Kennzahlen / Audit", "Boards"] as const;

function configWith(personas?: readonly PersonaDescriptor[]): LeistungConfig {
  return {
    id: "interne-bestellung",
    label: "Interne Bestellapplikation",
    kommune: "Zentraler Einkauf",
    rechtsgrundlagen: [{ norm: "Beschaffungsrichtlinie (interne Vorschrift)" }],
    // All three optional nav entries switched ON, so every derived item is on the surface.
    antrag: { steps: [{ id: "s1" }, { id: "s2" }] },
    register: { mock: [{ id: "r1" }] },
    ki: { chat: true },
    ...(personas ? { personas } : {}),
  } as unknown as LeistungConfig;
}

/** Renders the real shell for one workspace and returns the markup a user would get. */
function surface(config: LeistungConfig, persona?: string): string {
  return renderToStaticMarkup(
    <FachverfahrenShell
      config={config}
      {...(persona ? { persona } : {})}
      onPersonaChange={() => {}}
    >
      <div>Inhalt</div>
    </FachverfahrenShell>,
  );
}

/** The navigation words ON THE SURFACE, in order — `renderNavItem` is the only place that emits a bare
 *  `<span class="truncate">`; brand, switcher and badges all carry further classes. Exact words, no substrings. */
function navWords(html: string): string[] {
  return [...html.matchAll(/<span class="truncate">([^<]*)<\/span>/g)].map(
    (m) => m[1]!,
  );
}

/** The words of ONE workspace, rendered through the whole real chain. */
const wordsFor = (
  personas: readonly PersonaDescriptor[] | undefined,
  persona?: string,
): string[] => navWords(surface(configWith(personas), persona));

describe("Persona navigation — the seam names its own routes", () => {
  // ── POSITIVE CONTROL ─────────────────────────────────────────────────────────────────────────────────
  // Without it the case measures nothing: if the witness could not read navigation words AT ALL, every
  // assertion below about their disappearance would be met for free. It also pins TODAY's wording.
  it("POSITIVE CONTROL: the witness reads the navigation words — and they are today's", () => {
    expect(wordsFor(undefined, "buerger")).toEqual([...TODAY_CITIZEN]);
    expect(wordsFor(undefined, "sachbearbeitung")).toEqual([
      ...TODAY_CASEWORKER,
    ]);
    expect(wordsFor(undefined, "aufsicht")).toEqual([...TODAY_OVERSIGHT]);
  });

  // ── THE CASE ─────────────────────────────────────────────────────────────────────────────────────────
  it("THE CASE: a seam with navigation words of its own shows THEM on the surface — not the administrative words", () => {
    const ownWords = [
      "Bedarf melden",
      "Meine Bedarfe",
      "Benachrichtigungen",
    ] as const;
    // TAUTOLOGY LOCK: the declared word MUST differ from the one it replaces — otherwise this test would
    // pass through equality instead of through effect.
    for (const w of ownWords) expect(TODAY_CITIZEN).not.toContain(w);

    expect(
      wordsFor(
        [
          {
            key: "buerger",
            label: "Bedarfsträger:in",
            sub: "Startet den Vorgang",
            navLabels: {
              antrag: ownWords[0],
              antraege: ownWords[1],
              postfach: ownWords[2],
            },
          },
        ],
        "buerger",
      ),
      // The three declared words are there, „Start"/„Boards" stay generic (not declared) — and the
      // administrative words are GONE. An internal purchase order files no «Antrag».
    ).toEqual(["Start", ...ownWords, "Boards"]);
  });

  it("…and that holds for EVERY persona, not only the first", () => {
    const personas: readonly PersonaDescriptor[] = [
      {
        key: "sachbearbeitung",
        label: "Einkauf / Vergabestelle",
        navLabels: {
          eingang: "Bedarfe im Einkauf",
          akten: "Vergabevorgänge",
          register: "Lieferanten",
          assistent: "Einkaufs-Assistent",
        },
      },
      {
        key: "aufsicht",
        label: "Vergabe-Revision",
        navLabels: { kennzahlen: "Vergabe-Kennzahlen" },
      },
    ];
    expect(wordsFor(personas, "sachbearbeitung")).toEqual([
      "Bedarfe im Einkauf",
      "Vergabevorgänge",
      "Lieferanten",
      "Einkaufs-Assistent",
      "Boards",
    ]);
    expect(wordsFor(personas, "aufsicht")).toEqual([
      "Vergabe-Kennzahlen",
      "Boards",
    ]);
  });

  it("…and also for a PROCEDURE-SPECIFIC persona outside the three canonical keys", () => {
    expect(
      wordsFor(
        [
          {
            key: "lieferant",
            label: "Lieferant",
            home: "/lieferant",
            navLabels: { home: "Meine Angebote", boards: "Team-Raum" },
          },
        ],
        "lieferant",
      ),
    ).toEqual(["Meine Angebote", "Team-Raum"]);
  });

  // ── KEY LOCK ─────────────────────────────────────────────────────────────────────────────────────────
  // An override renames EXACTLY its own entry. Without this lock the mechanism could write a word
  // anywhere and the case test would still be green.
  it("KEY LOCK: a word for an entry of another persona does NOT appear", () => {
    expect(
      wordsFor(
        // `eingang` belongs to the caseworker persona — the citizen view has no such entry.
        [
          {
            key: "buerger",
            label: "Bedarfsträger:in",
            navLabels: { eingang: "DARF-NICHT-ERSCHEINEN" },
          },
        ],
        "buerger",
      ),
      // No foreign word, and every existing entry keeps today's.
    ).toEqual([...TODAY_CITIZEN]);
  });

  // ── FAIL-OPEN ────────────────────────────────────────────────────────────────────────────────────────
  // ⛔ In normal operation the change hits EVERY existing application. Whoever declares nothing must see
  // exactly the same as before — no required field, no silent tightening.
  it("FAIL-OPEN: without a declaration the whole surface is byte-identical — not just the words", () => {
    const persona: PersonaDescriptor = {
      key: "buerger",
      label: "Bedarfsträger:in",
      sub: "Startet den Vorgang",
    };
    const withoutField = surface(configWith([persona]), "buerger");
    const withEmptyField = surface(
      configWith([{ ...persona, navLabels: {} }]),
      "buerger",
    );
    expect(withEmptyField).toBe(withoutField);
    expect(navWords(withoutField)).toEqual([...TODAY_CITIZEN]);
  });

  it("FAIL-OPEN: an empty/blank word falls back to today's instead of emptying the surface", () => {
    expect(
      wordsFor(
        [
          {
            key: "buerger",
            label: "Bedarfsträger:in",
            navLabels: { antrag: "   ", postfach: "" },
          },
        ],
        "buerger",
      ),
    ).toEqual([...TODAY_CITIZEN]);
  });

  it("FAIL-OPEN: workspace mode (no active persona) stays untouched", () => {
    expect(
      wordsFor([
        {
          key: "buerger",
          label: "Bedarfsträger:in",
          navLabels: { boards: "Team-Raum" },
        },
      ]),
    ).toEqual(["Boards"]);
  });
});
