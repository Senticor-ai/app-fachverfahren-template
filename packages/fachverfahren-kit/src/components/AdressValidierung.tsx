// fachverfahren-kit/components/AdressValidierung — deterministische Adress-/Melderegister-Validierung (XÖV/XMeld), KEINE KI.
//
// Prüft eine eingegebene Anschrift gegen eine REGELBASIERTE Registerquelle (z. B. XMeld/AZR/kommunales
// Melderegister) über den injizierten Port `onValidieren`. Das Ergebnis ist deterministisch und
// nachvollziehbar — bewusst abgegrenzt von der probabilistischen KI-Vorbefüllung (siehe KiPrefill):
// hier gibt es keine Vorschläge „aus dem Modell", sondern abgeglichene amtliche Treffer. Genau-1-Treffer
// wird MARKIERT und bleibt editierbar (nie automatisch überschrieben); Mehrdeutigkeit wird zur Auswahl
// vorgelegt; ohne Treffer ist der manuelle Weg offen.
//
// GENERISCH + DEP-FREI (React + lucide + cn + Kit-Primitive). Keine Domänen-Literale — Felder sind die
// generischen Adressbestandteile strasse/plz/ort; alle Texte sind feststehende a11y-Hinweise, kein Fach.
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echte Formularfelder mit FormField-Verdrahtung, Ergebnis-Auswahl
// als echte Radiogroup (role="radiogroup"/radio, Pfeiltasten), echte <button>, sichtbarer Fokus, Status
// über die zentrale Ansage (StatusRegion), Icons dekorativ (aria-hidden), Information nie nur über Farbe,
// Ziel-Größe >=24px, motion-reduce respektiert.
import * as React from "react";
import { CheckCircle2, ListChecks, MapPin, SearchCheck, ShieldCheck } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
} from "../ui/form-field.js";
import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { useViewState, announcePoliteness } from "../hooks/use-view-state.js";

/** Eine (Teil-)Anschrift — generische Adressbestandteile, keine Domänen-Felder. */
export interface AdressWert {
  strasse?: string | undefined;
  plz?: string | undefined;
  ort?: string | undefined;
}

/** Ein vollständig abgeglichener, amtlicher Registertreffer (alle Bestandteile gesetzt). */
export interface AdressTreffer {
  strasse: string;
  plz: string;
  ort: string;
}

/** Fachliche Ausprägung des deterministischen Ergebnisses (idle/loading/error trägt useViewState). */
type ErgebnisArt = "treffer" | "mehrdeutig" | "keinTreffer";

interface ErgebnisDaten {
  readonly art: ErgebnisArt;
  readonly treffer: ReadonlyArray<AdressTreffer>;
}

export interface AdressValidierungProps {
  /** Aktuell eingegebene Anschrift (Ausgangswert; bleibt jederzeit von Hand editierbar). */
  wert: AdressWert;
  /**
   * Deterministischer Registerabgleich. Liefert die abgeglichenen Treffer:
   * leer → kein Treffer, genau 1 → eindeutig, >1 → mehrdeutig (zur Auswahl).
   * Wirft bei technischem Fehler (wird klassifiziert/angesagt).
   */
  onValidieren: (wert: AdressWert) => Promise<Array<AdressTreffer>>;
  /** Übernimmt einen (bestätigten) Treffer in den aufrufenden Datensatz — nie automatisch. */
  onUebernehmen?: ((treffer: AdressTreffer) => void) | undefined;
  className?: string;
}

const FELDER: ReadonlyArray<{ key: keyof AdressWert; label: string; autoComplete: string; placeholder: string }> = [
  { key: "strasse", label: "Straße und Hausnummer", autoComplete: "street-address", placeholder: "Straße Nr." },
  { key: "plz", label: "Postleitzahl", autoComplete: "postal-code", placeholder: "PLZ" },
  { key: "ort", label: "Ort", autoComplete: "address-level2", placeholder: "Ort" },
];

function formatTreffer(t: AdressTreffer): string {
  return `${t.strasse}, ${t.plz} ${t.ort}`;
}

function istLeer(w: AdressWert): boolean {
  return !w.strasse?.trim() && !w.plz?.trim() && !w.ort?.trim();
}

/**
 * Deterministische Adress-/Melderegister-Validierung mit explizitem Ergebnis-Zustand.
 *
 * @example
 * <AdressValidierung
 *   wert={anschrift}
 *   onValidieren={(w) => registerPort.abgleichen(w)}
 *   onUebernehmen={(t) => setAnschrift(t)}
 * />
 */
export function AdressValidierung({
  wert,
  onValidieren,
  onUebernehmen,
  className,
}: AdressValidierungProps) {
  const { announce } = useStatusRegion();
  // Editierbarer Eingabe-Spiegel: die Anschrift bleibt IMMER von Hand änderbar, nie auto-überschrieben.
  const [eingabe, setEingabe] = React.useState<AdressWert>(wert);
  // Gewählter Treffer im mehrdeutigen Fall (Index in ergebnis.treffer).
  const [auswahlIndex, setAuswahlIndex] = React.useState(0);

  const view = useViewState<ErgebnisDaten>({
    messages: {
      loading: "Anschrift wird gegen das Melderegister geprüft …",
    },
  });
  const status = view.state.status;

  // Eltern-Wert-Änderung (z. B. KI-Vorbefüllung außerhalb) spiegeln, solange kein Ergebnis offen ist.
  React.useEffect(() => {
    setEingabe(wert);
  }, [wert]);

  const setFeld = React.useCallback((key: keyof AdressWert, value: string) => {
    setEingabe((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pruefen = React.useCallback(async () => {
    if (istLeer(eingabe)) return;
    view.start();
    try {
      const treffer = await onValidieren(eingabe);
      const art: ErgebnisArt =
        treffer.length === 0 ? "keinTreffer" : treffer.length === 1 ? "treffer" : "mehrdeutig";
      setAuswahlIndex(0);
      const message =
        art === "treffer"
          ? "Eindeutiger Registertreffer gefunden. Bitte prüfen und übernehmen."
          : art === "mehrdeutig"
            ? `${treffer.length} mögliche Anschriften gefunden. Bitte die zutreffende auswählen.`
            : "Keine passende Anschrift im Register gefunden. Sie können die Eingabe manuell weiterführen.";
      // ready statt success: das Ergebnis ist informativ; die bindende Aktion ist erst „Übernehmen".
      view.set("ready", { data: { art, treffer }, message });
    } catch (err) {
      view.fail(err);
    }
  }, [eingabe, onValidieren, view]);

  const uebernehmen = React.useCallback(
    (treffer: AdressTreffer) => {
      setEingabe(treffer);
      onUebernehmen?.(treffer);
      view.set("success", { message: "Anschrift aus dem Register übernommen." });
      announce("Anschrift aus dem Register übernommen.", "polite");
    },
    [onUebernehmen, view, announce],
  );

  const zuruecksetzen = React.useCallback(() => {
    view.set("idle", { data: undefined, message: "Eingabe kann erneut geprüft werden." });
  }, [view]);

  const ergebnis = (status === "ready" || status === "success") ? view.state.data : undefined;
  const istPruefend = status === "loading";
  const istUebernommen = status === "success";
  const eingabeLeer = istLeer(eingabe);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-info" />
          <div className="space-y-1">
            <CardTitle>Anschrift gegen das Melderegister prüfen</CardTitle>
            <CardDescription>
              Deterministischer Abgleich (XÖV/XMeld) – keine KI-Schätzung. Treffer werden markiert und
              bleiben von Ihnen editierbar; nichts wird automatisch überschrieben.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Eingabe — bleibt jederzeit von Hand editierbar (keine Auto-Überschreibung). */}
        <div className="grid gap-4 sm:grid-cols-3">
          {FELDER.map((feld) => (
            <FormField key={feld.key} className={feld.key === "strasse" ? "sm:col-span-3" : undefined}>
              <FormLabel>{feld.label}</FormLabel>
              <FormControl>
                <Input
                  value={eingabe[feld.key] ?? ""}
                  autoComplete={feld.autoComplete}
                  placeholder={feld.placeholder}
                  inputMode={feld.key === "plz" ? "numeric" : undefined}
                  disabled={istPruefend}
                  onChange={(e) => setFeld(feld.key, e.target.value)}
                />
              </FormControl>
            </FormField>
          ))}
        </div>

        <FormField>
          <FormDescription>
            Die Prüfung gleicht die Eingabe regelbasiert mit der amtlichen Registerquelle ab. Das Ergebnis
            ist nachvollziehbar und unterscheidet sich bewusst von einer KI-Vorbefüllung.
          </FormDescription>
        </FormField>

        {/* Fehlerzustand: garantierte Recovery über ErrorState. */}
        {status === "error" ||
        status === "offline" ||
        status === "forbidden" ||
        status === "sessionExpired" ||
        status === "conflict" ? (
          <ErrorState
            inline
            title={view.state.message ?? "Die Prüfung konnte nicht abgeschlossen werden"}
            description="Sie können die Prüfung erneut anstoßen oder die Anschrift manuell weiterführen."
            onRetry={() => {
              void pruefen();
            }}
          />
        ) : null}

        {/* Ergebnis: genau-1 / mehrdeutig / kein Treffer. */}
        {ergebnis?.art === "treffer" ? (
          <TrefferKarte
            treffer={ergebnis.treffer[0]!}
            uebernommen={istUebernommen}
            onUebernehmen={uebernehmen}
          />
        ) : null}

        {ergebnis?.art === "mehrdeutig" ? (
          <MehrdeutigAuswahl
            treffer={ergebnis.treffer}
            auswahlIndex={auswahlIndex}
            onAuswahl={setAuswahlIndex}
            onUebernehmen={uebernehmen}
          />
        ) : null}

        {ergebnis?.art === "keinTreffer" ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-status-warn/40 bg-status-warn-soft p-4"
          >
            <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-warn" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">Keine passende Anschrift im Register gefunden</p>
              <p className="text-muted-foreground">
                Bitte prüfen Sie Ihre Eingabe auf Tippfehler oder führen Sie den Vorgang mit der von Ihnen
                erfassten Anschrift manuell weiter.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {istUebernommen
            ? "Anschrift aus dem Register übernommen."
            : "Die Prüfung ist freiwillig und überschreibt Ihre Eingabe nicht automatisch."}
        </p>
        <div className="flex flex-wrap gap-2">
          {ergebnis != null ? (
            <Button type="button" variant="ghost" size="sm" onClick={zuruecksetzen}>
              Erneut prüfen
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void pruefen();
            }}
            disabled={istPruefend || eingabeLeer}
          >
            <SearchCheck aria-hidden="true" />
            {istPruefend ? "Wird geprüft …" : "Im Register prüfen"}
          </Button>
        </div>
      </CardFooter>

      {/* Zentrale Ansage des aktuellen Zustands (aria-live). */}
      <StatusAnsage message={view.state.message} status={status} busy={istPruefend} />
    </Card>
  );
}

// ── Teil-Ansichten ────────────────────────────────────────────────────────────────────────────────

/** Lokale, kontrollierte Ansage — koppelt 1:1 an den ViewState (sr-only). */
function StatusAnsage({
  message,
  status,
  busy,
}: {
  message: string | undefined;
  status: ReturnType<typeof useViewState>["state"]["status"];
  busy: boolean;
}) {
  const politeness = announcePoliteness(status);
  return (
    <div
      role={politeness === "assertive" ? "alert" : "status"}
      aria-live={politeness}
      aria-atomic="true"
      aria-busy={busy || undefined}
      className="sr-only"
    >
      {message}
    </div>
  );
}

/** Genau-1-Treffer: markiert (Badge + Icon + Text, nicht nur Farbe), übernehmbar, Eingabe bleibt editierbar. */
function TrefferKarte({
  treffer,
  uebernommen,
  onUebernehmen,
}: {
  treffer: AdressTreffer;
  uebernommen: boolean;
  onUebernehmen: (t: AdressTreffer) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between",
        uebernommen ? "border-status-ok/40 bg-status-ok-soft" : "border-status-info/40 bg-status-info-soft",
      )}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", uebernommen ? "text-status-ok" : "text-status-info")} />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={uebernommen ? "ok" : "info"}>
              {uebernommen ? "Übernommen" : "Eindeutiger Treffer"}
            </Badge>
            <span className="text-xs text-muted-foreground">Registerabgleich</span>
          </div>
          <p className="text-sm font-medium text-foreground">{formatTreffer(treffer)}</p>
          <p className="text-xs text-muted-foreground">
            {uebernommen
              ? "Diese Anschrift wurde übernommen. Sie können die Felder oben weiterhin anpassen."
              : "Bitte prüfen Sie den Treffer und übernehmen Sie ihn bei Bedarf. Ihre Eingabe bleibt unverändert, bis Sie übernehmen."}
          </p>
        </div>
      </div>
      {!uebernommen ? (
        <Button type="button" size="sm" className="shrink-0" onClick={() => onUebernehmen(treffer)}>
          <CheckCircle2 aria-hidden="true" />
          Treffer übernehmen
        </Button>
      ) : null}
    </div>
  );
}

/** Mehrdeutig: Auswahl als echte Radiogroup (Pfeiltasten), dann gezielte Übernahme. */
function MehrdeutigAuswahl({
  treffer,
  auswahlIndex,
  onAuswahl,
  onUebernehmen,
}: {
  treffer: ReadonlyArray<AdressTreffer>;
  auswahlIndex: number;
  onAuswahl: (index: number) => void;
  onUebernehmen: (t: AdressTreffer) => void;
}) {
  const groupLabelId = React.useId();

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % treffer.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + treffer.length) % treffer.length;
    else return;
    event.preventDefault();
    onAuswahl(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-status-info/40 bg-surface p-4">
      <div className="flex items-start gap-3">
        <ListChecks aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-info" />
        <div className="space-y-1">
          <p id={groupLabelId} className="text-sm font-medium text-foreground">
            Mehrere mögliche Anschriften – bitte die zutreffende auswählen
          </p>
          <p className="text-xs text-muted-foreground">
            Der Registerabgleich ist nicht eindeutig. Wählen Sie den passenden Eintrag und übernehmen Sie ihn.
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={groupLabelId} className="space-y-2">
        {treffer.map((t, index) => {
          const selected = index === auswahlIndex;
          return (
            <div
              key={`${t.strasse}-${t.plz}-${t.ort}-${index}`}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onAuswahl(index)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onAuswahl(index);
                } else {
                  onKeyDown(e, index);
                }
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                selected
                  ? "border-primary bg-status-info-soft text-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border",
                  selected ? "border-primary" : "border-muted-foreground",
                )}
              >
                {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              <span className="flex-1">{formatTreffer(t)}</span>
              {selected ? <Badge tone="info">Ausgewählt</Badge> : null}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const chosen = treffer[auswahlIndex];
            if (chosen) onUebernehmen(chosen);
          }}
        >
          <CheckCircle2 aria-hidden="true" />
          Ausgewählte Anschrift übernehmen
        </Button>
      </div>
    </div>
  );
}
