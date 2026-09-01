// fachverfahren-kit/leistung-contract-form — DIE EINE Quelle der PFLICHT-FORM des Leistungs-Vertrags.
//
// ── WARUM DIESE DATEI EXISTIERT (gemessen 2026-09-01, Lauf `beweis-0901b`) ────────────────────────────
// Die Phase `build` verbrauchte ihr komplettes Rundenbudget (12 Runden) mit 26 Lesungen und NULL
// Schreibungen; 16 dieser Lesungen galten EINER Datei: `packages/fachverfahren-kit/src/types.ts`
// (943 Zeilen / 57.029 Bytes). Ein Agent blätterte 57 KB in 7.500-Zeichen-Scheiben durch, um zu
// erfahren, welche acht Felder eine `LeistungConfig` PFLICHTMÄSSIG trägt. Der Pflicht-Kern stand
// bereits als Code in `scripts/check-leistung-contract.mts` — nur nicht in maschinenlesbarer Form.
//
// ── WARUM NICHT ZWEI STELLEN ─────────────────────────────────────────────────────────────────────────
// Ein danebengelegtes JSON-Schema wäre eine ZWEITE Wahrheit: es könnte eine Pflicht behaupten, die der
// Prüfer nicht erzwingt (oder umgekehrt), und niemand merkte es. Deshalb steht die Pflichtmenge HIER
// EINMAL als Daten, und BEIDE Seiten leiten sich daraus ab:
//   • `scripts/check-leistung-contract.mts` FÜHRT sie aus (`pruefeForm`) — der Prüfer bleibt die Wahrheit;
//   • `scripts/emit-leistung-schema.mts` PROJIZIERT sie (`zuJsonSchema`) nach
//     `schemas/leistung-config.schema.json`.
// Drift ist damit strukturell unmöglich statt nur bemerkbar.
//
// ── GRENZE DER PROJEKTION (bewusst) ──────────────────────────────────────────────────────────────────
// Hier steht NUR, was JSON-Schema ausdrücken kann: Anwesenheit, Typ, Mindestlänge. Die graph-wertigen
// Zusicherungen der StatusMachine (Initialzustand existiert · mind. ein Endzustand · keine Sackgasse ·
// keine Unerreichbarkeit · Rollen je Übergang) und die Zweckbindungs-Prüfung der Datenanbindung bleiben
// im Prüfer — ein JSON-Schema kann sie nicht tragen. Das Schema ist damit SCHWÄCHER als der Prüfer,
// niemals stärker: es behauptet keine Pflicht, die der Prüfer nicht erzwingt.

/** Der JSON-Schema-Typ eines Pflichtfeldes. Mehr Formen braucht der Pflicht-Kern nicht. */
export type FormArt = "string" | "array";

/** EINE Pflicht des Vertrags — ausführbar (Prüfer) und projizierbar (JSON-Schema). */
export interface FormPflicht {
  /** Punkt-Pfad im Contract-Snapshot, z. B. `antrag.steps` oder `register.suchfelder`. */
  readonly pfad: string;
  readonly art: FormArt;
  /** Nur bei `art: "array"` — Mindestanzahl Einträge (JSON-Schema `minItems`). */
  readonly minItems?: number;
  /** Der Verstoßtext, den `check:leistung-contract` ausgibt. Wortgleich zum Stand vor dieser Datei. */
  readonly verstoss: string;
  /** Warum die Pflicht besteht — wandert als `description` ins JSON-Schema. */
  readonly grund: string;
}

/**
 * DIE PFLICHT-FORM. Acht Felder — jedes davon erzwingt `check:leistung-contract` seit jeher; die Texte
 * sind unverändert übernommen, damit diese Datei nichts verschärft und nichts aufweicht.
 */
export const LEISTUNG_CONTRACT_FORM: readonly FormPflicht[] = [
  {
    pfad: "id",
    art: "string",
    verstoss: "contract.id fehlt/leer.",
    grund:
      "Slug der Leistung — die Adresse des Verfahrens im Repo und in der Route.",
  },
  {
    pfad: "label",
    art: "string",
    verstoss: "contract.label fehlt/leer.",
    grund: "Anzeigename der Leistung (Bürger-Oberfläche und Bescheid-Kopf).",
  },
  {
    pfad: "kommune",
    art: "string",
    verstoss: "contract.kommune fehlt/leer.",
    grund:
      "Die erlassende Behörde — ohne sie hat der Verwaltungsakt keinen Urheber.",
  },
  {
    pfad: "rechtsgrundlagen",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.rechtsgrundlagen muss mind. 1 Norm enthalten (Geerdet-Prinzip).",
    grund:
      "Geerdet-Prinzip: mind. eine Norm { norm, titel, satzung? }. Kein Verfahren ohne Rechtsgrundlage.",
  },
  {
    pfad: "antrag.steps",
    art: "array",
    minItems: 1,
    verstoss: "contract.antrag.steps muss mind. 1 Schritt enthalten.",
    grund:
      "Der Antragsassistent braucht mind. einen Schritt (StepDef mit id, titel, felder[]).",
  },
  {
    pfad: "statusMachine.states",
    art: "array",
    minItems: 1,
    verstoss: "contract.statusMachine.states muss mind. 1 Zustand enthalten.",
    grund:
      "Zustände { key, label, terminal? } der Bearbeitung. Der Prüfer fordert darüber hinaus: initial existiert, mind. ein terminaler Zustand, keine Sackgasse, keine Unerreichbarkeit, Rollen je Übergang.",
  },
  {
    pfad: "detailSektionen",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.detailSektionen muss mind. 1 Sektion enthalten (SB-Detailsicht).",
    grund:
      "Die Sachbearbeiter-Detailsicht braucht mind. eine Sektion — sonst sieht die Fachkraft den Vorgang nicht.",
  },
  {
    pfad: "register.suchfelder",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.register.suchfelder muss mind. 1 Once-Only-Suchfeld enthalten.",
    grund:
      "Once-Only: mind. ein Suchfeld, über das ein bestehender Vorgang gefunden wird, statt neu erfragt zu werden.",
  },
] as const;

/** Liest einen Punkt-Pfad aus einem Objekt. `undefined`, sobald ein Glied fehlt. */
function lies(wurzel: unknown, pfad: string): unknown {
  let aktuell: unknown = wurzel;
  for (const glied of pfad.split(".")) {
    if (aktuell === null || typeof aktuell !== "object") return undefined;
    aktuell = (aktuell as Record<string, unknown>)[glied];
  }
  return aktuell;
}

/**
 * FÜHRT die Pflicht-Form gegen einen Contract-Snapshot aus und liefert die Verstoßtexte (leer = in Ordnung).
 * Rein / seiteneffektfrei. `check:leistung-contract` ruft genau das auf — es gibt keine zweite Prüfstelle.
 */
export function pruefeForm(snapshot: unknown): string[] {
  const verstoesse: string[] = [];
  for (const pflicht of LEISTUNG_CONTRACT_FORM) {
    const wert = lies(snapshot, pflicht.pfad);
    if (pflicht.art === "string") {
      if (typeof wert !== "string" || wert.length === 0)
        verstoesse.push(pflicht.verstoss);
    } else {
      const min = pflicht.minItems ?? 0;
      if (!Array.isArray(wert) || wert.length < min)
        verstoesse.push(pflicht.verstoss);
    }
  }
  return verstoesse;
}

/** Ein JSON-Schema-Knoten (nur die Formen, die diese Projektion erzeugt). */
export type SchemaKnoten = Record<string, unknown>;

function blatt(pflicht: FormPflicht): SchemaKnoten {
  return pflicht.art === "string"
    ? { type: "string", minLength: 1, description: pflicht.grund }
    : {
        type: "array",
        minItems: pflicht.minItems ?? 0,
        description: pflicht.grund,
      };
}

/**
 * PROJIZIERT die Pflicht-Form in ein JSON-Schema (Draft 2020-12). Deterministisch: die Reihenfolge ist
 * die von `LEISTUNG_CONTRACT_FORM`, es fließt kein Datum, kein Zufall, keine Umgebung ein.
 *
 * `additionalProperties: true` ist ABSICHT: der Vertrag trägt zahlreiche OPTIONALE Bausteine (tarif,
 * codelisten, registerRefs, fimRefs, fristenTypen, datenanbindung, zustellung, rechenproben, ki,
 * personas …), die der Prüfer NICHT erzwingt. Sie hier zu fordern hieße, eine Pflicht zu behaupten,
 * die die Wahrheit nicht kennt.
 */
export function zuJsonSchema(): SchemaKnoten {
  const properties: Record<string, SchemaKnoten> = {};
  const required: string[] = [];

  for (const pflicht of LEISTUNG_CONTRACT_FORM) {
    const glieder = pflicht.pfad.split(".");
    const kopf = glieder[0]!;
    if (!required.includes(kopf)) required.push(kopf);

    if (glieder.length === 1) {
      properties[kopf] = blatt(pflicht);
      continue;
    }
    if (glieder.length !== 2)
      throw new Error(
        `zuJsonSchema: Pfad "${pflicht.pfad}" ist tiefer als zwei Glieder — die Projektion deckt das nicht.`,
      );

    const kind = glieder[1]!;
    const eltern = (properties[kopf] ??= {
      type: "object",
      required: [] as string[],
      properties: {} as Record<string, SchemaKnoten>,
      additionalProperties: true,
    });
    (eltern["required"] as string[]).push(kind);
    (eltern["properties"] as Record<string, SchemaKnoten>)[kind] =
      blatt(pflicht);
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://senticor.local/schemas/leistung-config.schema.json",
    title: "LeistungConfig — Pflicht-Kern",
    description:
      "GENERIERT aus packages/fachverfahren-kit/src/leistung-contract-form.ts via `node --experimental-strip-types scripts/emit-leistung-schema.mts` — NICHT von Hand editieren. Der PRÜFER (scripts/check-leistung-contract.mts) bleibt die Wahrheit; dieses Schema ist seine JSON-ausdrückbare Teilmenge. Nicht abgebildet, weil JSON-Schema es nicht tragen kann: StatusMachine-Graph (initial existiert, mind. ein Endzustand, keine Sackgasse, keine Unerreichbarkeit, Rollen je Übergang), Frische des Snapshots und die Zweckbindung der Datenanbindung.",
    type: "object",
    required,
    properties,
    additionalProperties: true,
  };
}
