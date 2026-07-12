# Wiederholgruppen-Felder in `packages/fachverfahren-kit` (PLAN)

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: PLAN — beschreibt eine Zielarchitektur für `packages/fachverfahren-kit`,
> die noch nicht existiert. Kein Code in diesem Dokument ist bereits
> implementiert.
> Quellen: `packages/fachverfahren-kit/src/types.ts`,
> `packages/fachverfahren-kit/src/lib/antrag-felder.ts`,
> `packages/fachverfahren-kit/src/lib/interpreter.ts`,
> `docs/examples/hunderegister/findings.md` (der auslösende Befund).
> Pflicht-Lektüre vorher: `AGENTS.md` (insbesondere „Was Agenten NIE
> anfassen" und „DIE EINE Austausch-Naht"), `docs/reference/fachverfahren-kit-components.md`,
> `docs/ux-ui/fachverfahren-ux-contract.md`, `docs/reference/test-driven-development.md`.

## Ausgangsbefund

`docs/examples/hunderegister/findings.md` (Recherche zum realen Berliner
Hunderegister) und eine unabhängige Code-Analyse des Templates kommen zum
selben Ergebnis: `packages/fachverfahren-kit` hat aktuell **keine generische
UI für eine wiederholbare Gruppe von Entitäten mit eigenen Feldern** — z. B.
mehrere Hunde je Halter:in, jeder mit eigener Chip-Nummer/Rasse/Status,
einzeln lebenszyklus-fähig. Das ist keine hundespezifische Anforderung:
dasselbe Muster taucht bei mehreren Antragstellenden, mehreren Fahrzeugen,
mehreren Betriebsstätten usw. auf.

Die Datenschicht unterstützt Array-Pfade bereits: `parsePath`/`getPath`/
`setPath` in `packages/fachverfahren-kit/src/lib/antrag-felder.ts`
verarbeiten Pfade wie `"posten[0].wert"` korrekt (genutzt für
Gebührenpositionen, getestet). Es fehlt die Schicht darüber: ein
`FeldDef`-Konzept für „N Einträge, je Eintrag dieselben Unter-Felder", die
Stepper-UI dafür (Hinzufügen/Entfernen), sowie die Interpreter-/
Validierungs-Rekursion und die Sachbearbeitungs-Anzeige.

Diese Erweiterung ist laut `AGENTS.md` klar PLATTFORMARBEIT (mit Tests +
Storybook) — kein Nebenprodukt eines einzelnen Fachverfahren-Builds. Sie
gehört in `packages/fachverfahren-kit`, nicht in `apps/fachverfahren`.

## Zielbild (Zusammenfassung)

Ein neuer `FeldTyp`-Wert `"list"` an `FeldDef` (statt eines separaten Arrays
neben `StepDef.felder`) mit einem Payload `ListFieldDef`, dessen Unter-Felder
RELATIVE Namen tragen und zur Laufzeit auf absolute Array-Pfade
(`hunde[0].rasse`) materialisiert werden — über dieselbe, bereits getestete
`parsePath`/`getPath`/`setPath`-Maschinerie. Dadurch funktionieren
`feldFehler`, `feldAnzeige`, `evalBedingung`, `FeldRenderer` usw. auf einem
materialisierten Eintrags-Feld UNVERÄNDERT; nur die ca. 10 Stellen, die
heute schon über `step.felder` iterieren, bekommen je einen neuen
`typ === "list"`-Zweig. GENAU EIN Verschachtelungslevel (kein
Liste-in-Liste) — strukturell erzwungen und per Test verriegelt.

Neu eingeführte Symbolnamen sind hier **Englisch** benannt, gemäß der in
`AGENTS.md` selbst festgehaltenen Konvention „Code, Typen, Variablen …
Englisch" — auch wenn ein Teil der BESTEHENDEN Typnamen in diesem Paket
(`FeldTyp`, `FeldDef`, `StepDef`, `Bedingung`, `sichtbarWenn`, …) historisch
Deutsch ist. Bestehende Namen werden hier unverändert zitiert, nicht
umbenannt — das wäre ein eigener, hier nicht vorgeschlagener Refactor.

## 1. Typ-Design (`packages/fachverfahren-kit/src/types.ts`)

```ts
export type FeldTyp =
  | "text"
  | "plz"
  | "date"
  | "select"
  | "checkbox"
  | "number"
  | "tel"
  | "email"
  | "textarea"
  | "ja-nein"
  | "file"
  // NEU — eine wiederholbare Gruppe von Pro-Eintrag-Feldern. Der Wert im
  // Antragsdaten-Objekt ist ein Array von Objekten; die Form jedes Objekts
  // beschreibt `FeldDef.list.fields` (RELATIVE Namen). GENAU EIN
  // Verschachtelungslevel — ein Eintrags-Feld mit `typ: "list"` wird
  // ignoriert (siehe `ListFieldDef.fields`-JSDoc).
  | "list";

/** Pro-Eintrag-Konfiguration eines `typ: "list"`-Felds. */
export interface ListFieldDef {
  /** Eintrags-Felddefinitionen mit RELATIVEM `name` (z. B. "rasse", NICHT
   *  "hunde[0].rasse") — Stepper/Interpreter materialisieren den absoluten
   *  Pfad zur Laufzeit. GENAU EIN Level: ein Eintrags-Feld mit
   *  `typ: "list"` wird ignoriert (bewusste Grenze, kein bekannter
   *  Anwendungsfall, hält Rendering/A11y/Validierung einfach). Eintrags-Felder
   *  können relative `sichtbarWenn`/`regeln[].wenn`/`hinweise[].wenn` über
   *  ein `"./"`-Präfix auf ANDERE Felder DESSELBEN Eintrags beziehen (z. B.
   *  `{ feld: "./nichtIso", op: "==", wert: true }`); ein Pfad OHNE `"./"`
   *  bleibt absolut (globale Antragsdaten außerhalb der Liste). */
  fields: FeldDef[];
  /** Minimale Eintragszahl. Fehlt sie UND `required: true` ⇒ Default 1
   *  (dieselbe „required"-Semantik wie bei Skalarfeldern). Explizites
   *  `minItems` hat immer Vorrang. */
  minItems?: number;
  /** Maximale Eintragszahl (Default unbegrenzt). */
  maxItems?: number;
  /** Eintrags-Label-Vorlage für Überschrift/aria-label je Eintrag; `{n}`
   *  wird 1-basiert ersetzt. Default „Eintrag {n}" (neutral, KEIN
   *  Domänen-Literal — ein Verfahren liefert z. B. „Hund {n}" als DATEN). */
  itemLabelTemplate?: string;
  /** Beschriftung des Hinzufügen-Buttons (Default „+ Eintrag hinzufügen"). */
  addLabel?: string;
  /** Beschriftung des Entfernen-Buttons je Eintrag (Default „Entfernen"). */
  removeLabel?: string;
}

export interface FeldDef {
  // … unverändert …
  typ: FeldTyp;
  /** NUR bei `typ: "list"` gelesen. */
  list?: ListFieldDef;
}

/** Quantor-Bedingung über eine LISTE (Aggregat-Prädikat, z. B. „mindestens
 *  EIN Eintrag erfüllt X" — getrennt von Eintrags-internen `regeln`, die je
 *  Eintrag gelten). Additiv zu `Bedingung`. */
export interface ListCondition {
  /** Pfad des Listenfelds (z. B. "hunde"). */
  list: string;
  /** "all" (jeder Eintrag erfüllt …) · "some" (mind. 1 Eintrag) · "none"
   *  (kein Eintrag). Leere Liste: "all"/"none" vakuos wahr, "some" falsch. */
  quantifier: "all" | "some" | "none";
  /** Bedingung, ausgewertet über die RELATIVEN Feldpfade jedes Eintrags
   *  (gleiche `"./"`-Konvention wie Eintrags-Felder). */
  condition: Bedingung;
}
export type Bedingung = FeldBedingung | BedingungGruppe | ListCondition;

export interface DetailSektion {
  titel: string;
  /** Ohne `list`: unverändert flache Feld/Wert-Zeilen. Mit `list`: `pfad`
   *  je Zeile ist RELATIV zum Eintrag. */
  felder: { pfad: string; label: string }[];
  /** OPTIONAL — rendert diese Sektion als Liste (ein Mini-Abschnitt je
   *  Array-Eintrag) statt einer flachen Liste. Additiv: eine Sektion ohne
   *  `list` verhält sich exakt wie heute. */
  list?: { listPath: string; itemLabelTemplate?: string };
}
```

**Warum `typ: "list"` an `FeldDef` statt eines Arrays neben
`StepDef.felder`:** `StepDef.felder: FeldDef[]` wird in genau dieser
Reihenfolge iteriert von `resolveSteps`, `typisiereAntragsdaten`,
`stepGueltig`/`stepGueltigVollstaendig`, `sichtbareSchritte`,
`abgeleiteteFelder`, `interpretNachweise`, `extraktionsZielFelder` und der
`AntragStepper`-Render-Schleife (per `grep -n "\.felder\b"` über `src/`
verifiziert). Ein separates Array würde an jeder dieser ~10 Stellen eine
Zusammenführung zweier Sammlungen unter Erhalt der Autor:innen-Reihenfolge
verlangen; eine `typ: "list"`-Variante braucht dort nur je einen zusätzlichen
`if (feld.typ === "list")`-Zweig in der ohnehin vorhandenen Schleife. Damit
ist auch `sichtbarWenn` auf der Liste SELBST („die ganze Wiederholgruppe nur
zeigen, wenn Vorgangsart == mehrere") kostenlos — es ist einfach
`FeldDef.sichtbarWenn`, bereits von `sichtbareSchritte` ausgewertet.

**Warum genau ein Verschachtelungslevel:** kein Beleg — weder im
Hunderegister-Befund noch in einem bestehenden `DetailSektion`-Beispiel
dieses Repos — für eine Liste-in-Liste. Strukturell erzwungen hält es
Barrierefreiheit (verschachtelte Wiederholgruppen sind WCAG-technisch
notorisch schwierig), Rendering und die `"./"`-Konvention einfach. Zur
Laufzeit durchgesetzt (Eintrags-Felder mit `typ: "list"` werden bei der
Auflösung verworfen), per JSDoc dokumentiert und per Test verriegelt.

**Eintrags-interne vs. listenweite Bedingungen**, konkret am Beispiel „Chip-
Nummer nur Pflicht, wenn Identifikationsart = Chip" vs. „mindestens ein Hund
ist gefährlich":

- **Pro Eintrag** (z. B. ein Zusatzfeld nur bei `nichtIso = true` sichtbar):
  normale `FeldRegel`/`sichtbarWenn` am Eintrags-`FeldDef`, mit
  `"./"`-Konvention: `{ feld: "./nichtIso", op: "==", wert: true }`.
- **Listenweit** (mind. ein Eintrag erfüllt X → z. B. ein Warnschritt wird
  sichtbar, oder ein Summenfeld wird Pflicht): eine `ListCondition` innerhalb
  eines Schritt- oder Feld-`sichtbarWenn`/`FeldRegel.wenn`, z. B.
  `{ list: "hunde", quantifier: "some", condition: { feld: "gefaehrlich", op: "==", wert: true } }`.
- **Zählbasiert** (z. B. „ab dem 2. Hund gilt ein höherer Tarif") braucht
  **keinen neuen Mechanismus**: `getPath(daten, "hunde.length")`
  funktioniert bereits heute (Array-`.length` ist ein normaler Objekt-Key) —
  ein Regressionstest sichert das ab, statt neuer Interpreter-Oberfläche.
  Eine echte Summierung PRO Eintrag (z. B. „Summe aller Einzelgebühren")
  bleibt bewusst außerhalb — dafür ist der bestehende `berechne`-Escape-Hatch
  zuständig.

## 2. `lib/antrag-felder.ts` — reine Hilfsfunktionen

Datei: `packages/fachverfahren-kit/src/lib/antrag-felder.ts`

Neue reine Exporte:

```ts
export function listItemPath(
  listPath: string,
  index: number,
  itemFieldName: string,
): string;
// "hunde", 0, "rasse" → "hunde[0].rasse" — die eine Stelle, die Eintrags-Pfade zusammensetzt.

export function materializeItemField(
  itemField: FeldDef,
  listPath: string,
  index: number,
): FeldDef;
// { ...itemField, name: listItemPath(...) } — macht feldFehler/feldAnzeige/FeldRenderer unverändert nutzbar.

export function listEntries(field: FeldDef, daten: Antragsdaten): unknown[];
// getPath(daten, field.name) als Array, [] wenn unset/kein Array.

export function addListEntry(field: FeldDef, daten: Antragsdaten): Antragsdaten;
// hängt {} am nächsten Index an; No-op, wenn maxItems bereits erreicht.

export function removeListEntry(
  field: FeldDef,
  daten: Antragsdaten,
  index: number,
): Antragsdaten;
// immutables Entfernen ohne Lücken im Ergebnis-Array.

export function listCountError(
  field: FeldDef,
  daten: Antragsdaten,
): string | null;
// minItems (Default 1, falls required)/maxItems-Prüfung — der „intrinsische" Listenfehler, parallel zu feldFehler.

export function formatItemLabel(
  template: string | undefined,
  indexZeroBased: number,
): string;
// Default „Eintrag {n}"; gemeinsam genutzt von AntragStepper UND lib/detail-section.ts (eine Wahrheit für Eintrags-Labels).
```

Erweiterte bestehende Funktionen um einen `typ === "list"`-Zweig:

- `resolveFeld`/`resolveSteps` — rekursiv in `feld.list.fields`, damit
  Eintrags-`optionsRef` (z. B. ein Auswahlfeld je Eintrag aus
  `config.datenlisten`/`config.codelisten`) exakt wie heute aufgelöst wird.
- `typisiereAntragsdaten` — für ein Listenfeld über `listEntries(...)`
  iterieren, je Index/Eintrags-Feld `getPath`/`typisiereFeldwert`/`setPath`
  am materialisierten absoluten Pfad (spiegelt die bestehende Skalar-Schleife
  1:1).
- `stepGueltig` — neuer Zweig: für ein `typ==="list"`-Feld gilt
  `listCountError(...) === null` UND jedes Eintrags-Feld jedes Eintrags
  besteht `feldFehler` am materialisierten Pfad (wertet bewusst KEINE
  `sichtbarWenn`/`regeln` aus — exakt wie der heutige Skalar-Zweig von
  `stepGueltig`, der diese ebenfalls ignoriert; diese Asymmetrie zwischen
  `stepGueltig` und `stepGueltigVollstaendig` besteht schon heute und wird
  nicht neu eingeführt).

Keine Änderung nötig an `feldFehler`, `feldAnzeige`, `istBeantwortet`,
`asString`, `feldLabel`, `feldHint`, `parsePath`/`getPath`/`setPath` — sie
funktionieren bereits auf dem materialisierten Eintrags-`FeldDef`.

## 3. Validierung & Interpreter (`lib/interpreter.ts`)

```ts
function materializeItemCondition(
  b: Bedingung | undefined,
  prefix: string,
): Bedingung | undefined;
// schreibt FeldBedingung.feld mit "./"-Präfix zu `${prefix}.${feld.slice(2)}` um; rekursiert in
// BedingungGruppe.alle/eine/nicht; lässt ListCondition und Nicht-"./"-Pfade unverändert (absolut/global).

export function materializeItemFieldComplete(
  itemField: FeldDef,
  listPath: string,
  index: number,
): FeldDef;
// = materializeItemField(...) PLUS Umschreiben von sichtbarWenn/regeln[].wenn/hinweise[].wenn über
// materializeItemCondition. Die EINE Funktion, die AntragStepper UND Interpreter-Validierung aufrufen —
// danach ist das Eintrags-Feld ein gewöhnliches, absolutes FeldDef; feldFehlerVollstaendig, feldHinweise,
// evalBedingung, FeldRenderer brauchen NULL Änderungen.

export function visibleItemFields(
  feld: FeldDef,
  daten: Antragsdaten,
  index: number,
): FeldDef[];
// (feld.list?.fields ?? []).map(materializeItemFieldComplete).filter(f => evalBedingung(f.sichtbarWenn, daten))
// — die eine Wahrheit für „welche Eintrags-Felder rendern/validieren für DIESEN Eintrag", genutzt von UI
// und stepGueltigVollstaendig, spiegelt das bestehende sichtbareSchritte-Muster für Schritte.
```

Erweiterungen:

- `evalBedingung` — neuer Zweig für `ListCondition` (erkennbar am
  `"list"`-Key): liest `getPath(daten, b.list)` als Array, wertet
  `b.condition` je Eintrag nach Präfix-Umschreibung
  (`${b.list}[${i}]`-Stil) aus, wendet dann `every`/`some`/`!some` je
  `quantifier` an.
- `stepGueltigVollstaendig` — für jedes `feld` in `step.felder`: bei
  `typ !== "list"` unverändert; bei `typ === "list"`:
  `listCountError(feld, daten) === null` UND jedes `visibleItemFields(feld,
daten, i)` besteht `feldFehlerVollstaendig(f, daten, kontext) === null`
  je Eintrag (versteckte Eintrags-Felder werden nicht validiert — dieselbe
  „verstecktes Pflichtfeld blockiert nicht"-Regel wie bei Skalarfeldern über
  `sichtbareSchritte`).
- `abgeleiteteFelder` (M1 Codelisten→Feld-Ableitung) — rekursiv: für ein
  Listenfeld, je Eintrags-Index, die bestehende Einzelfeld-Ableitungslogik
  gegen das materialisierte `optionsRef`-Feld des Eintrags ausführen und den
  abgeleiteten Wert in DENSELBEN Eintrag schreiben (nicht in ein globales
  Feld). Damit kann z. B. eine Rasse-Auswahl je Hund ein per-Eintrag-Flag
  ableiten (`sonderklasse`, `gefaehrlich`, …) — genau der Fall aus dem
  Hunderegister-Befund („Rasse → Gefährlichkeitseinstufung"), deshalb hier
  bewusst mit eingeplant statt später nachgezogen.
- `interpretNachweise` (Codelisten `belege` → Nachweise) — gleiche
  Rekursion. **Dokumentierte Vereinfachung:** `Nachweis` ist im Typ heute
  nicht eintrags-skaliert; wählen Eintrag 0 und Eintrag 1 beide eine
  Kategorie, die „Nachweis X" fordert, sieht die Sachbearbeitung EINE
  Zeile „Nachweis X erforderlich" (Dedup nach `belegId`, wie schon heute bei
  feldübergreifendem Dedup), nicht zwei. Akzeptabler MVP-Scope, in der
  PR-Beschreibung explizit als bekannte Einschränkung zu nennen, nicht
  stillschweigend zu verstecken.

**Bewusst außerhalb des Scopes:** Once-Only-Registervorbefüllung
(`AntragStepper`s `tryRegisterLookup`) steigt nicht in `feld.list.fields`
ab. Pro-Eintrag-Once-Only-Vorbefüllung (welche Registerzeile passt zu
welchem UI-Eintrag?) ist ein deutlich härteres Problem ohne belegten Bedarf
hier — als künftige Iteration markiert, nichts stürzt ab, `onceOnly` an
einem Eintrags-Feld ist schlicht wirkungslos.

## 4. Sachbearbeitungs-Anzeige

Neue Datei: `packages/fachverfahren-kit/src/lib/detail-section.ts` (rein,
kein React — passend zum „Komponenten rendern, lib rechnet"-Schnitt des
restlichen Pakets, statt `antrag-felder.ts` — das bürgernahe Eingabe-Logik
bündelt — um SB-Anzeigelogik zu erweitern):

```ts
export interface DetailFieldRow {
  pfad: string;
  label: string;
  wert: unknown;
}
export interface DetailItemGroup {
  titel: string;
  zeilen: DetailFieldRow[];
}
export interface DetailSectionProjection {
  flach?: DetailFieldRow[];
  gruppen?: DetailItemGroup[];
}

export function projectSection(
  section: DetailSektion,
  antragsdaten: unknown,
): DetailSectionProjection;
// ohne `list`: flach = section.felder über getPath (aus antrag-felder.ts, Array-Index-fähig) aufgelöst —
// gleiches „Felder ohne Wert ausblenden"-Verhalten wie heute.
// mit `list`: je Eintrag in getPath(antragsdaten, section.list.listPath) als Array eine DetailItemGroup
// (titel = formatItemLabel(...)), deren zeilen section.felder[].pfad RELATIV zum Eintrag auflösen, gleiche
// Wertfilterung je Eintrag. 0 Einträge ⇒ gruppen: [].
```

Dann:

- `packages/fachverfahren-kit/src/components/VorgangDetail.tsx`: die interne
  `Sektion`-Komponente unterscheidet nach `sektion.list` — Flach-Modus
  rendert exakt wie heute (`getPfad`/`formatWert` bleiben exportiert/
  unverändert); Listen-Modus rendert eine verschachtelte Überschrift + `<dl>`
  je `DetailItemGroup` innerhalb derselben äußeren Karte (Mini-Tabelle pro
  Eintrag statt einer riesigen flachen Feldliste für N Hunde — löst direkt
  das genannte Sachbearbeitungs-Problem). Null Einträge zeigt explizit
  „Keine Einträge erfasst." statt die Sektion auszublenden — bewusst anders
  als die „bei leer ausblenden"-Regel der Flach-Sektion, weil eine
  Sachbearbeitung bei einer Liste unterscheiden muss zwischen „keine Daten
  geladen" und „Halter:in hat null Hunde" — zwei verschiedene Fakten.
- `packages/fachverfahren-kit/src/components/ReviewWorkspace.tsx`: der
  `formularFelder`-Baustein (der „Formular"-Belege-Tab) dupliziert heute
  `VorgangDetail`s Flachlogik mit eigenem `getPfad`/`formatWert`-Import — auf
  `projectSection` umstellen, `gruppen` zu `{pfad, label, wert}`-Zeilen mit
  Eintrags-Label-Präfix (z. B. „Eintrag 2 – Rasse") flach machen, passend
  zum bestehenden dichten SB-Review-Tabellenstil statt der Karten-Optik von
  `VorgangDetail`. Entfernt nebenbei die bestehende Logik-Duplikation
  zwischen beiden Komponenten.
- `packages/fachverfahren-kit/src/components/Arbeitsvorrat.tsx`:
  `schluesselFelder` (`config.detailSektionen[0]?.felder`) wählt heute die
  Felder der ersten Sektion als kompakte Vorschauspalten. Sollte Sektion 0
  `list` gesetzt haben, sind ihre `felder` eintrags-relativ und lösen nicht
  gegen einen einzelnen `Vorgang` auf — Picker ändern zu
  `config.detailSektionen.find((s) => !s.list)?.felder ?? []`, d. h.
  Listen-Sektionen für diesen kompakten Anwendungsfall überspringen.

## 5. Tests & Storybook

**`antrag-felder.test.ts`** (erweitern): `listItemPath`/`materializeItemField`
(Pfad-Bau), `listEntries` (undefined/Nicht-Array → `[]`),
`addListEntry`/`removeListEntry` (Immutabilität, `maxItems`-Deckel,
Index-Kompaktierung beim Entfernen), `typisiereAntragsdaten` (typisierte
Werte landen korrekt in Array-Elementen), `stepGueltig` mit `minItems: 1`
(falsch bei 0 Einträgen, falsch bei 1 unvollständigem Eintrag, wahr bei
vollständigem), `resolveFeld`/`resolveSteps` (Eintrags-`optionsRef` löst
gegen `datenlisten`/`codelisten` auf), Regressionstest: ein Eintrags-Feld mit
`typ: "list"` wird ignoriert (verriegelt die Ein-Level-Grenze).

**`interpreter.test.ts`** (erweitern): `materializeItemFieldComplete`/
`visibleItemFields` (relatives `sichtbarWenn` je Eintrag unabhängig
ausgewertet), `stepGueltigVollstaendig`-Rekursion (Eintrags-`regeln`,
bedingte Pflicht), `evalBedingung` mit `ListCondition` (`all`/`some`/`none`,
inkl. Leer-Array-Randfälle), Regressionstest
`evalBedingung({ feld: "eintraege.length", op: ">=", wert: 2 }, daten)`,
`abgeleiteteFelder`-Rekursion (Ableitung je Eintrag unabhängig),
`interpretNachweise`-Rekursion (inkl. Dedup-Verhalten aus Abschnitt 3
explizit getestet).

**Neu `detail-section.test.ts`**: Flach-Modus (Parität mit heutigem
`getPfad`/`formatWert`), Listen-Modus (N Gruppen, relative Pfadauflösung,
Leerwert-Filterung je Eintrag, 0 Einträge → `gruppen: []`).

**`contract-snapshot.test.ts`** — ein neuer Test: ein `typ:"list"`-`FeldDef`
durchläuft `toContractSnapshot` unverändert (Regressions-Absicherung für die
Additiv-/Kompatibilitätsaussage aus Abschnitt 6).

**Neue Story** `stories/AntragListenFelder.stories.tsx`, im Aufbau
angelehnt an `AntragFeldtypen.stories.tsx` (`createFachverfahrenStore` +
`AntragStepper`, umschlossen von `StatusRegionProvider`, da Hinzufügen/
Entfernen `useStatusRegion().announce` nutzt). **Bewusst neutrales
Vokabular** gemäß `AGENTS.md` (keine Domäneninhalte in Kit-Code) — nach dem
etablierten Muster von `BusinessLogikDaten.stories.tsx` (`objekt`/
`kategorie`/`menge`): ein Schritt „Objekte" mit einem `typ:"list"`-Feld
`objekte` (`minItems: 1`, `maxItems: 5`), Eintrags-Felder `bezeichnung`
(Text, Pflicht), `kategorie` (Auswahl via `optionsRef` in `datenlisten`),
`wert` (Zahl) mit einem `"./"`-relativen `sichtbarWenn` auf ein viertes
Eintrags-Feld zur Demonstration bedingter Pro-Eintrag-Sichtbarkeit. Gemäß
der Definition-of-Done im UX-Vertrag deckt diese eine Story ab: Default (0
Einträge + Hinzufügen), Edge (`maxItems` erreicht → Hinzufügen-Button
deaktiviert), Error (Absenden mit unvollständigem Eintrag → Pro-Eintrag-
Fehler + Listen-Zählfehler in `ErrorSummary`), und die Pro-Eintrag-
Zusammenfassung im Review-Schritt.

## 6. Migration/Kompatibilität

- **Rein additiv** für bestehende `LeistungConfig`s. `typ: "list"` ist ein
  neuer Union-Wert; kein bestehender `FeldDef.typ`-Wert ändert seine
  Bedeutung. Jede berührte Funktion bekommt einen neuen bedingten Zweig,
  keinen geänderten Default-Pfad — Configs ohne `typ:"list"`-Felder
  durchlaufen exakt dieselben Codepfade wie zuvor.
- **`emit:contract`/`leistung.contract.json`:** keine Änderung an
  `packages/fachverfahren-kit/src/contract-snapshot.ts` nötig. `antrag.steps`
  wird verbatim durchgereicht; ein `typ:"list"`-`FeldDef` mit verschachteltem
  `list.fields`-Array ist bereits reine, JSON-sichere Daten. Jedes
  Fachverfahren, das ein Listenfeld nutzt, braucht nur den ohnehin
  vorgeschriebenen `pnpm --filter @senticor/fachverfahren emit:contract`-Lauf
  — keine Schema-Migration (per Round-Trip-Test in Abschnitt 5 abgesichert).
- **`scripts/check-leistung-contract.mts`** enumeriert keine
  `FeldTyp`-Werte (verifiziert — prüft nur `register.suchfelder`-Kardinalität
  und Rechtsgrundlagen), braucht keine Änderung.
- **Notwendige, kleine Anschlussstellen** (per `grep -rn "\.felder\b"` über
  `src/` ermittelt, um stille Brüche statt Compile-Fehler zu vermeiden):
  - `packages/fachverfahren-kit/src/lib/dokument-extraktion.ts` —
    `"list"` in `NICHT_EXTRAHIERBAR` aufnehmen (eine Wiederholgruppe ist
    kein gültiges OCR-/KI-Extraktionsziel).
  - `Arbeitsvorrat.tsx` — `schluesselFelder`-Guard (Abschnitt 4).
  - `ReviewWorkspace.tsx` — `formularFelder`-Baustein (Abschnitt 4).
- **`index.ts`** braucht keine manuellen Export-Ergänzungen:
  `packages/fachverfahren-kit/src/index.ts` re-exportiert bereits
  `./types.js`, `./lib/antrag-felder.js`, `./lib/interpreter.js` vollständig.
  Nur die neue `lib/detail-section.ts` braucht eine zusätzliche
  `export * from "./lib/detail-section.js";`-Zeile.
- **Explizite Nicht-Ziele** (hält die Serie begrenzt): verschachtelte
  Listen; Once-Only-Vorbefüllung pro Eintrag; tabellarische Summierung pro
  Eintrag (bleibt `berechne`-Escape-Hatch); nicht-dedupliziert Nachweise pro
  Eintrag.

## 7. Reihenfolge (TDD, je eigener Commit/PR)

Nach `docs/reference/test-driven-development.md`s Rot→Grün→Refactor und
diesem Repo-Schnitt „lib zuerst, Komponenten delegieren":

1. **Typen + reine `antrag-felder.ts`-Primitive, test-first.** Typ-Ergänzungen
   (`ListFieldDef`, `FeldTyp`, `ListCondition`, `DetailSektion.list`) +
   fehlschlagende Tests in `antrag-felder.test.ts`, dann die neuen reinen
   Funktionen plus die `resolveFeld`/`typisiereAntragsdaten`/
   `stepGueltig`-Rekursionszweige. Gate: `pnpm run typecheck && pnpm run test`.
2. **Interpreter-Rekursion, test-first.** Fehlschlagende Tests in
   `interpreter.test.ts` für `materializeItemFieldComplete`,
   `visibleItemFields`, den `ListCondition`-Zweig in `evalBedingung`,
   `stepGueltigVollstaendig`/`abgeleiteteFelder`/`interpretNachweise`-
   Rekursion, plus den `"eintraege.length"`-Regressionstest. Baut auf 1 auf.
3. **`lib/detail-section.ts` (neue Datei), test-first.** Unabhängig von 4–5;
   kann parallel zu 2 laufen, sobald Typen aus 1 stehen. Round-Trip-
   Regressionstest in `contract-snapshot.test.ts` ebenfalls hier (schnell,
   risikoarm, belegt die Kompatibilitätsaussage aus Abschnitt 6).
4. **`AntragStepper.tsx`-UI.** Neue modul-lokale `ListFieldRenderer`-
   Komponente; Einbindung in `step.felder.map`, den Review-Schritt-
   `flatMap`, `stepFehlerEintraege`; `NICHT_EXTRAHIERBAR`-Guard in
   `lib/dokument-extraktion.ts` ergänzen. Baut auf 1–2 auf. Validiert über
   Storybook, nicht über neue Komponenten-Tests (bestehende Konvention:
   keine `*.test.tsx` unter `components/`).
5. **`VorgangDetail.tsx` + `ReviewWorkspace.tsx` + `Arbeitsvorrat.tsx`.**
   Sachbearbeitungs-Anzeige über `projectSection`. Baut auf 3 auf,
   unabhängig von 4 — könnte parallel dazu landen.
6. **Storybook + Doku.** `AntragListenFelder.stories.tsx`; kurzer Hinweis
   „Wiederholgruppen" in `docs/reference/fachverfahren-kit-components.md`
   ergänzen (die neuen Funktionen sind Library-Ebene, keine neuen
   Top-Level-Komponenten — daher eher ein Absatz als eine neue
   Katalog-Zeile). Abschließend voller Verifikations-Gate aus `AGENTS.md`
   (`check:storybook`, `check:css-tokens`, `lint`, `typecheck`, `test`,
   `check:agent-ui`).

Jeder Schritt landet als eigener Commit/PR in dieser Reihenfolge; 3 und 5
können relativ zu 2/4 umsortiert werden (disjunkte Dateien), aber 1 muss vor
allem anderen stehen und 2 vor 4.

## Kritische Dateien

- `packages/fachverfahren-kit/src/types.ts`
- `packages/fachverfahren-kit/src/lib/antrag-felder.ts`
- `packages/fachverfahren-kit/src/lib/interpreter.ts`
- `packages/fachverfahren-kit/src/components/AntragStepper.tsx`
- `packages/fachverfahren-kit/src/components/VorgangDetail.tsx`
- `packages/fachverfahren-kit/src/lib/detail-section.ts` (neu)
