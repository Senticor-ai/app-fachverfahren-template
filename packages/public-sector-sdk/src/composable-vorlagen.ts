// composable-vorlagen — die drei Archetypen, aus denen eine zuständige Stelle abgeleitet wird.
//
// WOZU: ein Composable-Manifest trägt heute 15+ Slots (Befugnis, Fähigkeiten, Wissensbindung, Zone, Akteur,
// Aufgabenbereich, Zertifizierung …). Wer eine neue Stelle anlegt, muss diese Struktur jedes Mal neu erfinden —
// und erfindet sie jedes Mal ein bisschen anders. Gemessen an 32 realen Manifesten: `faehigkeiten` in 22,
// `befugnis` in 24, `beziehungen` in 13. Nicht weil die Stellen verschieden sind, sondern weil niemand sagt,
// was eine Stelle AUSMACHT.
//
// DIE DREI ARCHETYPEN sind keine Erfindung, sondern die gemessene Struktur jedes Verwaltungsverfahrens:
//   INITIATOR    bringt das Anliegen ein und ENTSCHEIDET NICHTS (Bürger:in, Antragstellende, Meldende)
//   BEARBEITUNG  prüft, subsumiert, entscheidet — die einzige Stelle mit Außenwirkung
//   AUFSICHT     beobachtet über viele Vorgänge, erkennt Muster, greift NICHT in den Einzelfall ein
// Die Engine-Keys (`buerger` · `sachbearbeitung` · `aufsicht`) bleiben stabile Naht-IDs; die Labels sind DATEN.
//
// WAS DIE VORLAGE FESTLEGT und was NICHT — die Trennung ist der ganze Wert:
//   Die Vorlage legt fest, was aus dem ARCHETYP folgt: darf diese Stelle entscheiden, braucht sie einen
//   Menschen, in welcher Zone sitzt sie, welche Autonomie-Decke gilt. Das sind RECHTSFOLGEN, keine Geschmacks-
//   fragen — ein Initiator, der Bescheide erlässt, ist kein Initiator mehr.
//   Sie legt NICHT fest, was FACHLICH ist: Titel, Aufgabenbereich, Fähigkeiten, Wissensbindung. Das kommt aus
//   dem Verfahren und kann keine Vorlage wissen.
//
// DIE ZENTRALE ZUSICHERUNG — und sie kommt aus einem teuer bezahlten Befund: eine Vorlage liefert NIEMALS ein
// halb gefülltes Manifest mit Platzhaltern. In der Nacht zum 2026-07-27 galten drei von fünf Verfahren als
// „grün“, weil sie die Vorlage `musterantrag` mit Platzhalter-Werten trugen — die Gates maßen die Gesundheit
// der VORLAGE. Eine Vorlage, die Platzhalter ausliefert, erzeugt genau diese Klasse. Deshalb gibt `ausVorlage`
// entweder ein VOLLSTÄNDIGES Manifest zurück oder die Liste dessen, was fehlt. Nie etwas dazwischen.
import type { MeshComposableManifest } from "./composable-cert-verify.js";

/** Die drei Archetypen jedes Verwaltungsverfahrens. */
export type Archetyp = "initiator" | "bearbeitung" | "aufsicht";

/** Was aus dem ARCHETYP folgt — Rechtsfolgen, nicht Geschmack. */
export interface ArchetypProfil {
  /** Die stabile Naht-ID der Engine. Labels sind DATEN, diese Kennung ist Vertrag. */
  id: string;
  /** Fläche (eigene Zuständigkeit im Verfahren) oder Struktur (geteilte Backend-Zelle). */
  art: "flaeche" | "struktur";
  /** Wer handelt: Mensch, KI-Agent oder beide im Vier-Augen-Prinzip. */
  akteur: "mensch" | "agent" | "beide";
  /** Die Zone, in der die Stelle sitzt — trägt die Netz-/Zugriffs-Trennung. */
  zone: string;
  /** Darf sie einen Verwaltungsakt erlassen? Der schwerste Marker, den eine Stelle tragen kann. */
  entscheidung: "erlaesst-va" | "entwurf-only" | "keine";
  /** Muss ein Mensch führen? Bei rechtsnahen Aufgaben nicht verhandelbar. */
  hitlPflicht: boolean;
  /** Autonomie-Obergrenze. Rechtsnah heißt höchstens „Advise“ (AAL-2). */
  autonomieDecke: "AAL-1" | "AAL-2" | "AAL-3";
  /** Warum dieser Archetyp so und nicht anders geschnitten ist — für den, der ihn wählt. */
  warum: string;
}

/**
 * Die drei Profile. Die Werte sind RECHTSFOLGEN und deshalb hier und nicht in der Hand des Verfahrens:
 * ein Initiator, der Bescheide erlässt, ist kein Initiator mehr; eine Aufsicht, die in den Einzelfall
 * eingreift, ist keine Aufsicht.
 */
export const ARCHETYPEN: Readonly<Record<Archetyp, ArchetypProfil>> =
  Object.freeze({
    initiator: Object.freeze({
      id: "buerger",
      art: "flaeche",
      akteur: "mensch",
      zone: "buerger",
      entscheidung: "keine",
      hitlPflicht: false,
      autonomieDecke: "AAL-1",
      warum:
        "Der Initiator bringt sein Anliegen ein und ENTSCHEIDET NICHTS. Gemessen an grundsteuer: er trägt keinen " +
        "einzigen Zustandsübergang. Eine leere Entscheidungs-Liste ist bei ihm die richtige Antwort, kein Mangel.",
    }),
    bearbeitung: Object.freeze({
      id: "sachbearbeitung",
      art: "flaeche",
      akteur: "beide",
      zone: "verwaltung",
      entscheidung: "erlaesst-va",
      hitlPflicht: true,
      autonomieDecke: "AAL-2",
      warum:
        "Die einzige Stelle mit Außenwirkung: sie prüft, subsumiert und verantwortet die Festsetzung. `beide` heißt " +
        "Mensch UND KI im Vier-Augen-Prinzip — die KI berät, der Mensch entscheidet. Die Autonomie-Decke steht auf " +
        "AAL-2 („Advise“), weil eine rechtsnahe Entscheidung nie autonom fallen darf.",
    }),
    aufsicht: Object.freeze({
      id: "aufsicht",
      art: "flaeche",
      akteur: "mensch",
      zone: "aufsicht",
      entscheidung: "keine",
      hitlPflicht: false,
      autonomieDecke: "AAL-2",
      warum:
        "Die Aufsicht sieht über VIELE Vorgänge — Muster, Auffälligkeiten, Kennzahlen, die prüfbare Akte. Sie greift " +
        "NICHT in den Einzelfall ein; täte sie es, wäre sie eine zweite Bearbeitung ohne deren Bindungen.",
    }),
  });

/** Was das VERFAHREN beisteuern muss — die Vorlage kann es nicht wissen. */
export interface FachlicheFuellung {
  /** Der Anzeigename dieser Stelle IN DIESEM Verfahren („Sachbearbeitung / Fachdienst“). */
  titel: string;
  /** Der kanonische Domänen-Slug des Verfahrens. */
  domain: string;
  /** Was diese Stelle im Verfahren TUT — in der Sprache des Fachbereichs, nicht der Technik. */
  aufgabenbereich: string;
  /** Die KI-Fähigkeiten dieser Stelle. Leer = rein deterministische Stelle (völlig legitim). */
  faehigkeiten?: string[];
  /** Die kuratierte Wissensbindung (Packs/Seeds/Graph-Scope). */
  wissen?: string[];
  /** Der Fachbereich/das Amt — die Wiederverwendungs-Achse über Leistungen hinweg. */
  amt?: string;
}

export interface VorlagenErgebnis {
  /** Das vollständige Manifest — NUR gesetzt, wenn nichts fehlt. */
  manifest?: MeshComposableManifest;
  /** Was noch fehlt. Leer genau dann, wenn `manifest` gesetzt ist. */
  fehlend: string[];
  /** Klartext für den, der die Vorlage benutzt. */
  meldung: string;
}

const leer = (v: unknown): boolean => typeof v !== "string" || !v.trim();

/**
 * Leitet ein Composable-Manifest aus Archetyp + fachlicher Füllung ab.
 *
 * ENTWEDER vollständig ODER eine Fehl-Liste — nie ein Manifest mit Platzhaltern. Das ist die Lehre aus den drei
 * Verfahren, die als „grün“ galten, weil sie die Demo-Vorlage trugen: eine Vorlage, die Platzhalter ausliefert,
 * produziert Erzeugnisse, die jedes Gate bestehen und nichts leisten.
 */
export function ausVorlage(
  archetyp: Archetyp,
  fachlich: FachlicheFuellung,
): VorlagenErgebnis {
  const profil = ARCHETYPEN[archetyp];
  if (!profil) {
    return {
      fehlend: ["archetyp"],
      meldung: `Unbekannter Archetyp „${String(archetyp)}“ — erlaubt sind: ${Object.keys(ARCHETYPEN).join(", ")}.`,
    };
  }
  const fehlend: string[] = [];
  if (leer(fachlich?.titel))
    fehlend.push("titel (der Anzeigename dieser Stelle im Verfahren)");
  if (leer(fachlich?.domain))
    fehlend.push("domain (der kanonische Slug des Verfahrens)");
  if (leer(fachlich?.aufgabenbereich))
    fehlend.push(
      "aufgabenbereich (was die Stelle TUT, in der Sprache des Fachbereichs)",
    );
  if (fehlend.length) {
    return {
      fehlend,
      meldung:
        `Die Vorlage „${archetyp}“ ist noch nicht ausgefüllt — es fehlen: ${fehlend.join(" · ")}. ` +
        "[Bewusst KEIN Manifest mit Platzhaltern: ein Erzeugnis mit Vorlagen-Werten besteht jedes Gate und leistet " +
        "nichts. Genau daran sind am 2026-07-27 drei von fünf Verfahren als „grün“ durchgegangen.]",
    };
  }

  const ki = [
    ...new Set(
      (fachlich.faehigkeiten ?? []).map((s) => s.trim()).filter(Boolean),
    ),
  ];
  const manifest: MeshComposableManifest = {
    schemaVersion: 1,
    id: profil.id,
    domain: fachlich.domain.trim(),
    titel: fachlich.titel.trim(),
    art: profil.art,
    akteur: profil.akteur,
    ...(fachlich.amt?.trim() ? { amt: fachlich.amt.trim() } : {}),
    aufgabenbereich: fachlich.aufgabenbereich.trim(),
    befugnis: {
      entscheidung: profil.entscheidung,
      hitlPflicht: profil.hitlPflicht,
    },
    // Autonomie NUR bei deklarierten KI-Fähigkeiten — ohne sie ist es eine rein deterministische Stelle,
    // und eine Autonomie-Angabe wäre eine Behauptung über etwas, das gar nicht existiert.
    ...(ki.length
      ? { faehigkeiten: { ki, autonomie: profil.autonomieDecke } }
      : {}),
    ...(fachlich.wissen?.length
      ? {
          wissen: [
            ...new Set(fachlich.wissen.map((s) => s.trim()).filter(Boolean)),
          ],
        }
      : {}),
  } as MeshComposableManifest;

  return {
    manifest,
    fehlend: [],
    meldung:
      `Stelle „${manifest.titel}“ aus dem Archetyp „${archetyp}“ abgeleitet. ` +
      `Aus dem Archetyp folgen (nicht verhandelbar): Entscheidungs-Befugnis „${profil.entscheidung}“, ` +
      `HITL-Pflicht ${profil.hitlPflicht ? "ja" : "nein"}, Zone „${profil.zone}“, Autonomie-Decke ${profil.autonomieDecke}. ` +
      profil.warum,
  };
}

/**
 * Passt eine BESTEHENDE Stelle zu ihrem Archetyp? Findet den häufigsten Schnitt-Fehler: eine Stelle, die
 * entscheiden darf, obwohl ihr Archetyp das ausschließt — oder eine rechtsnahe Stelle ohne Menschen.
 *
 * Reine Prüfung, kein Wurf: sie MELDET Abweichungen. Ob eine davon blockt, entscheidet die Verfassung.
 */
export function archetypBruch(
  manifest: MeshComposableManifest,
  archetyp: Archetyp,
): string[] {
  const p = ARCHETYPEN[archetyp];
  if (!p) return [`Unbekannter Archetyp „${String(archetyp)}“`];
  const brueche: string[] = [];
  const befugnis = (
    manifest as { befugnis?: { entscheidung?: unknown; hitlPflicht?: unknown } }
  ).befugnis;

  // ZWEI VERSCHIEDENE BEFUNDE, und sie durcheinanderzubringen wäre selbst eine Fabrikation: eine Stelle, die
  // „keine Entscheidung“ ERKLÄRT, sagt etwas — eine Stelle ohne `befugnis`-Block sagt gar nichts. Ihr die
  // Aussage „keine“ zu unterstellen und sie dann dafür zu rügen, wäre ein erfundenes Zitat. Beides bleibt ein
  // Bruch (das VERSCHÄRFT nichts weg), nur wird jeder bei seinem Namen genannt — und nur der erklärte Fall
  // erlaubt die Aussage, WAS dort stattdessen steht.
  const erklaert = typeof befugnis?.entscheidung === "string";
  const ist = erklaert ? (befugnis!.entscheidung as string) : "";
  if (!erklaert) {
    brueche.push(
      `Entscheidungs-Befugnis nicht erklärt — der Archetyp „${archetyp}“ verlangt „${p.entscheidung}“. ` +
        "[Ein fehlender `befugnis`-Block ist keine Aussage „keine“: er ist die fehlende Aussage selbst. " +
        "Wer entscheiden darf, muss im Manifest stehen — sonst entscheidet es die Laufzeit stillschweigend.]",
    );
  } else if (ist !== p.entscheidung) {
    brueche.push(
      `Entscheidungs-Befugnis „${ist}“ widerspricht dem Archetyp „${archetyp}“ (dort: „${p.entscheidung}“). ` +
        (p.entscheidung === "keine"
          ? "Eine Stelle, die hier entscheidet, ist kein " + archetyp + " mehr."
          : "Ohne diese Befugnis kann die Stelle ihre Rolle im Verfahren nicht ausfüllen."),
    );
  }
  if (p.hitlPflicht && befugnis?.hitlPflicht !== true) {
    brueche.push(
      "HITL-Pflicht fehlt, obwohl der Archetyp eine rechtsnahe Entscheidung trägt — sie darf nie autonom fallen.",
    );
  }
  return brueche;
}
