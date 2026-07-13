// process-graph — reine, FAIL-CLOSED Validierung einer ProzessDefinition gegen die StatusMachine ihres Verfahrens.
// Die Strenge liegt HIER (Deploy-Gate), NICHT im evalBedingung-Evaluator (der bleibt bewusst fail-open und EINE
// Wahrheit Client==Server). Ein Prozess mit auch nur EINEM Fehler wird nicht deployt.
import type { Bedingung, BedingungOperator, StatusMachine } from "../types.js";
import type {
  ProzessDefinition,
  ProzessKante,
  ProzessKnoten,
  ServiceTaskKnoten,
  UserTaskKnoten,
} from "./process-ir.js";

// V1-ausfuehrbare Knotentypen + Status-Guard leben HIER (nicht im reinen Typ-Modul process-ir), damit process-graph
// OHNE Laufzeit-Sibling-Wert-Import ladbar bleibt: check:leistung-contract laeuft via `node --experimental-strip-types`,
// das `.js`->`.ts` fuer WERT-Importe nicht aufloest (nur-Typ-Importe werden erased). So bleibt EINE Wahrheit + die
// Validierung im Gate-Pfad nutzbar.
const UNTERSTUETZTE_KNOTEN_TYPEN = new Set<string>([
  "start",
  "ende",
  "userTask",
  "serviceTask",
  "exclusiveGateway",
]);
/** Traegt der Knotentyp eine `catalogAction` (loest also eine Status-Transition aus)? */
function istStatusaendernd(
  k: ProzessKnoten,
): k is UserTaskKnoten | ServiceTaskKnoten {
  return k.typ === "userTask" || k.typ === "serviceTask";
}

export interface ProzessValidierungsFehler {
  code: string;
  detail: string;
  knotenId?: string;
  kanteId?: string;
}

// Vollstaendigkeits-erzwingende Laufzeit-Spiegelung von BedingungOperator: faellt ein Operator zum Typ hinzu,
// bricht dieses Literal den Typecheck (fehlender Key) — so bleibt die Operator-Wahrheit EINE.
const OPERATOR_MARKER: Record<BedingungOperator, true> = {
  "==": true,
  "!=": true,
  ">": true,
  ">=": true,
  "<": true,
  "<=": true,
  in: true,
  "nicht-in": true,
  gesetzt: true,
  "nicht-gesetzt": true,
};
const BEKANNTE_OPERATOREN = new Set<string>(Object.keys(OPERATOR_MARKER));

/** Sammelt alle Operatoren einer (rekursiven) Bedingung — fuer die [G2]-Pruefung „nur bekannte Operatoren". */
function operatorenIn(b: Bedingung): string[] {
  if ("feld" in b && "op" in b) return [b.op];
  const out: string[] = [];
  for (const teil of b.alle ?? []) out.push(...operatorenIn(teil));
  for (const teil of b.eine ?? []) out.push(...operatorenIn(teil));
  if (b.nicht) out.push(...operatorenIn(b.nicht));
  return out;
}

/** Ist die Bedingung „leer" (kein Praedikat) — dann taugt sie NICHT als Guard eines Nicht-Default-Zweigs. */
function istLeererGuard(b: Bedingung | undefined): boolean {
  if (!b) return true;
  if ("feld" in b && "op" in b) return false;
  const hatKinder =
    (b.alle?.length ?? 0) > 0 ||
    (b.eine?.length ?? 0) > 0 ||
    b.nicht !== undefined;
  return !hatKinder;
}

/**
 * Validiert eine ProzessDefinition FAIL-CLOSED gegen die StatusMachine des Verfahrens. Leere Fehlerliste = deploybar.
 * Prueft: eindeutige Ids; nur unterstuetzte Knotentypen [G5]; genau 1 Start, >=1 Ende; Kanten referenzieren
 * existierende Knoten; Erreichbarkeit ab Start (DFS); keine Sackgasse (Nicht-Ende hat Ausgang, Ende hat keinen);
 * Guards nur an Exclusive-Gateway-Zweigen; je Gateway genau 1 Default-Flow, jeder Nicht-Default-Zweig hat einen
 * nicht-leeren Guard mit ausschliesslich bekannten Operatoren [G2]; jeder statusaendernde Knoten mappt auf eine
 * Transition (to === catalogAction) mit knoten.vierAugen <=> transition.vierAugen [H4] und (userTask) nicht-leeren,
 * in der Transition enthaltenen Rollen.
 */
export function validateProzessGraph(
  def: ProzessDefinition,
  statusMachine: StatusMachine,
): ProzessValidierungsFehler[] {
  const fehler: ProzessValidierungsFehler[] = [];
  const push = (
    code: string,
    detail: string,
    extra: Partial<ProzessValidierungsFehler> = {},
  ) => fehler.push({ code, detail, ...extra });

  // ── Eindeutige Ids ──
  const knotenById = new Map<string, ProzessKnoten>();
  for (const k of def.knoten) {
    if (knotenById.has(k.id))
      push("knoten-id-doppelt", `Knoten-Id „${k.id}" ist nicht eindeutig`, {
        knotenId: k.id,
      });
    knotenById.set(k.id, k);
  }
  const kanteIds = new Set<string>();
  for (const e of def.kanten) {
    if (kanteIds.has(e.id))
      push("kante-id-doppelt", `Kanten-Id „${e.id}" ist nicht eindeutig`, {
        kanteId: e.id,
      });
    kanteIds.add(e.id);
  }

  // ── [G5] nur unterstuetzte Knotentypen ──
  for (const k of def.knoten)
    if (!UNTERSTUETZTE_KNOTEN_TYPEN.has(k.typ))
      push(
        "knoten-typ-nicht-unterstuetzt",
        `Knotentyp „${k.typ}" ist in V1 nicht ausfuehrbar`,
        {
          knotenId: k.id,
        },
      );

  // ── genau 1 Start, >=1 Ende ──
  const starts = def.knoten.filter((k) => k.typ === "start");
  if (starts.length !== 1)
    push(
      "start-anzahl",
      `Genau ein Start-Knoten erwartet, gefunden: ${starts.length}`,
    );
  const enden = def.knoten.filter((k) => k.typ === "ende");
  if (enden.length < 1)
    push("ende-fehlt", "Mindestens ein Ende-Knoten erforderlich");

  // ── Kanten referenzieren existierende Knoten ──
  const ausgehend = new Map<string, ProzessKante[]>();
  for (const e of def.kanten) {
    if (!knotenById.has(e.von))
      push(
        "kante-von-unbekannt",
        `Kante „${e.id}" startet an unbekanntem Knoten „${e.von}"`,
        {
          kanteId: e.id,
        },
      );
    if (!knotenById.has(e.nach))
      push(
        "kante-nach-unbekannt",
        `Kante „${e.id}" endet an unbekanntem Knoten „${e.nach}"`,
        {
          kanteId: e.id,
        },
      );
    const liste = ausgehend.get(e.von) ?? [];
    liste.push(e);
    ausgehend.set(e.von, liste);
  }

  // ── Erreichbarkeit ab Start (DFS) ──
  if (starts.length === 1) {
    const start = starts[0]!;
    const erreicht = new Set<string>([start.id]);
    const stapel = [start.id];
    while (stapel.length) {
      const cur = stapel.pop()!;
      for (const e of ausgehend.get(cur) ?? [])
        if (knotenById.has(e.nach) && !erreicht.has(e.nach)) {
          erreicht.add(e.nach);
          stapel.push(e.nach);
        }
    }
    for (const k of def.knoten)
      if (!erreicht.has(k.id))
        push(
          "knoten-unerreichbar",
          `Knoten „${k.id}" ist vom Start nicht erreichbar`,
          {
            knotenId: k.id,
          },
        );
  }

  // ── keine Sackgasse: Nicht-Ende hat >=1 Ausgang, Ende hat keinen ──
  for (const k of def.knoten) {
    const raus = ausgehend.get(k.id) ?? [];
    if (k.typ === "ende" && raus.length > 0)
      push(
        "ende-mit-ausgang",
        `Ende-Knoten „${k.id}" darf keine ausgehende Kante haben`,
        {
          knotenId: k.id,
        },
      );
    if (k.typ !== "ende" && raus.length === 0)
      push(
        "sackgasse",
        `Knoten „${k.id}" hat keine ausgehende Kante (Sackgasse)`,
        {
          knotenId: k.id,
        },
      );
  }

  // ── Guards nur an Exclusive-Gateway-Zweigen; [G2] Gateway-Vollstaendigkeit ──
  for (const k of def.knoten) {
    const raus = ausgehend.get(k.id) ?? [];
    if (k.typ === "exclusiveGateway") {
      const defaults = raus.filter((e) => e.default === true);
      if (defaults.length !== 1)
        push(
          "gateway-default",
          `Exclusive-Gateway „${k.id}" braucht genau EINEN Default-Flow (gefunden: ${defaults.length})`,
          { knotenId: k.id },
        );
      for (const e of raus) {
        if (e.default === true) continue;
        if (istLeererGuard(e.guard))
          push(
            "gateway-guard-leer",
            `Zweig „${e.id}" aus Gateway „${k.id}" braucht einen nicht-leeren Guard`,
            {
              kanteId: e.id,
            },
          );
        else
          for (const op of operatorenIn(e.guard!))
            if (!BEKANNTE_OPERATOREN.has(op))
              push(
                "gateway-guard-operator",
                `Zweig „${e.id}" nutzt unbekannten Operator „${op}"`,
                {
                  kanteId: e.id,
                },
              );
      }
    } else {
      for (const e of raus)
        if (e.guard !== undefined || e.default === true)
          push(
            "guard-ausserhalb-gateway",
            `Kante „${e.id}" traegt Guard/Default, geht aber nicht aus einem Exclusive-Gateway`,
            { kanteId: e.id },
          );
    }
  }

  // ── [H4] statusaendernde Knoten: Transition-Mapping + Vier-Augen-Bijektion + Rollen ──
  const transByTo = new Map<string, StatusMachine["transitions"]>();
  for (const t of statusMachine.transitions) {
    const liste = transByTo.get(t.to) ?? [];
    liste.push(t);
    transByTo.set(t.to, liste);
  }
  for (const k of def.knoten) {
    if (!istStatusaendernd(k)) continue;
    const kandidaten = transByTo.get(k.catalogAction) ?? [];
    if (kandidaten.length === 0) {
      push(
        "catalog-action-unbekannt",
        `Knoten „${k.id}" mappt auf „${k.catalogAction}", wofuer es keine StatusMachine-Transition (to) gibt`,
        { knotenId: k.id },
      );
      continue;
    }
    const knotenVierAugen = k.vierAugen === true;
    // Vier-Augen-Bijektion: der Knoten darf Vier-Augen nur behaupten/verschweigen, wie es ALLE gemappten
    // Transitionen tragen — sonst koennte er die Regel aushebeln.
    const alleVierAugen = kandidaten.every(
      (t) => (t.vierAugen === true) === knotenVierAugen,
    );
    if (!alleVierAugen)
      push(
        "vier-augen-bijektion",
        `Knoten „${k.id}" (vierAugen=${knotenVierAugen}) widerspricht der/den gemappten Transition(en) auf „${k.catalogAction}"`,
        { knotenId: k.id },
      );
    if (k.typ === "userTask") {
      if (k.rollen.length === 0)
        push(
          "usertask-ohne-rolle",
          `User-Task „${k.id}" braucht mindestens eine zustaendige Rolle`,
          {
            knotenId: k.id,
          },
        );
      // Jede Knoten-Rolle muss in JEDER gemappten Transition zulaessig sein (kein Rollen-Widening ueber den Katalog).
      for (const rolle of k.rollen)
        if (!kandidaten.every((t) => t.rollen.includes(rolle)))
          push(
            "usertask-rolle-nicht-im-katalog",
            `User-Task „${k.id}": Rolle „${rolle}" ist nicht in jeder gemappten Transition „${k.catalogAction}" erlaubt`,
            { knotenId: k.id },
          );
    }
  }

  return fehler;
}
