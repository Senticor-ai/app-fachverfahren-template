// fachverfahren-kit/components/DateiUpload — der GENERISCHE Nachweis-Upload (Bürger-Antrag + interne Sicht).
//
// Zweck: die erforderlichen/optionalen Nachweise eines Vorgangs hochladen, ersetzen, entfernen — mit klarem
// Status je Position (hochgeladen? · Datei-Name + Größe). VOLLSTÄNDIG CONFIG-GETRIEBEN: die Liste der Nachweise
// kommt als `nachweise: Nachweis[]` aus props (z.B. aus `config.nachweise(antragsdaten)`), KEINE Domänen-Literale.
//
// DEP-FREI: Drag&Drop + Datei-Auswahl rein über das native <input type="file"> + die HTML5-DnD-Events — KEINE Lib.
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): jede Dropzone ist KEIN reines Drag-Only — sie ist ein echter, per Tastatur
// fokussier-/auslösbarer Button (Enter/Space triggert den File-Dialog), trägt aria-describedby auf die Anforderung,
// Status wird in einer aria-live-Region gemeldet, Fehler tragen role="alert", Fokus-Ring sichtbar, Ziele >=24px,
// Animationen respektieren prefers-reduced-motion.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";
import {
  CheckCircle2,
  Clock,
  FileUp,
  Loader2,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";

import type { Nachweis } from "../types.js";
import { cn } from "../lib/utils.js";
import { formatDateiGroesse } from "../format.js";
import { nachweisBezugsweg } from "../lib/interpreter.js";
import {
  nachweisAcceptAttribut,
  nachweisEinschraenkungenText,
  pruefeNachweisDatei,
  type NachweisAblehnungsGrund,
} from "../lib/nachweis-pruefung.js";
import { Button } from "../ui/button.js";
import { Progress } from "../ui/progress.js";
import { NachweisAutorisierung } from "./NachweisAutorisierung.js";
import { useStatusRegion } from "./StatusRegion.js";

/**
 * Server-autoritativer Detail-Zustand einer einzelnen Nachweis-Position (data-driven, OPTIONAL).
 * Der echte Datei-Inhalt + die Prüfung (Format/Größe/Virenscan) laufen im PROD über den Port; diese
 * Komponente RENDERT nur den vom Server gemeldeten Zustand — sie entscheidet nichts selbst.
 *
 * - `idle`     — nichts im Gange (Standard, wenn kein Status gemeldet ist).
 * - `uploading`— Übertragung läuft; `fortschritt` (0–100) optional für eine bestimmte Anzeige.
 * - `scanning` — Übertragung fertig, Virenscan/serverseitige Prüfung läuft.
 * - `rejected` — serverseitig abgelehnt; `grund` (Format/Größe/Virus/…) als Klartext für Anzeige + Ansage.
 */
export type NachweisUploadPhase =
  | "idle"
  | "uploading"
  | "scanning"
  | "rejected";

// Die Ablehnungs-Kategorie `NachweisAblehnungsGrund` ist kanonisch in `../lib/nachweis-pruefung.js` definiert
// (EINE Wahrheit für die server-autoritative Statusanzeige HIER und die reine Fail-Fast-Vorprüfung dort) und wird
// über den Paket-Einstieg (index.ts re-exportiert die Lib) öffentlich bereitgestellt.

export interface NachweisUploadStatus {
  /** Aktuelle Phase dieser Position (server-autoritativ). */
  phase: NachweisUploadPhase;
  /** Übertragungs-Fortschritt 0–100 (nur bei `uploading`; fehlt = unbestimmt). */
  fortschritt?: number | undefined;
  /** Kategorie der Ablehnung (nur bei `rejected`) — steuert Icon/Wording, nicht den Text. */
  grund?: NachweisAblehnungsGrund | undefined;
  /** Klartext-Meldung (z. B. der Ablehnungsgrund) für sichtbare Anzeige + Screenreader-Ansage. */
  meldung?: string | undefined;
}

export interface DateiUploadProps {
  /** Die erforderlichen/optionalen Nachweise (data-driven, z.B. aus `config.nachweise(antragsdaten)`). */
  nachweise: Nachweis[];
  /**
   * Wird bei jeder Änderung einer Position gerufen: `datei` = die gewählte Datei (Name + Größe in Bytes),
   * oder `null`, wenn die Position geleert/entfernt wurde.
   */
  onChange: (
    id: string,
    datei: { name: string; groesse: number } | null,
  ) => void;
  /** Optionale Überschrift (generisch, ohne Domänen-Bezug). */
  titel?: string;
  /**
   * OPTIONAL + server-autoritativ: Detail-Zustand je Nachweis-Id (Upload-Fortschritt, Virenscan,
   * Ablehnung). Fehlt eine Id (oder die ganze Map), verhält sich die Position exakt wie bisher.
   */
  uploadStatus?: Record<string, NachweisUploadStatus | undefined> | undefined;
  /**
   * M4 — OPTIONAL: wird gerufen, wenn der/die Bürger:in einen `register-once-only`-Nachweis autorisiert (statt
   * hochzuladen). In PROD löst das den echten Registerabruf über den Port aus; hier bleibt der Fluss klickbar.
   */
  onRegisterAbruf?: ((id: string) => void) | undefined;
  className?: string;
}

/** Bytes menschenlesbar formatieren (de-DE) — delegiert an die EINE Wahrheit in `../format.js`. */
const formatGroesse = formatDateiGroesse;

/** Lokal hochgeladene Datei-Metadaten je Nachweis-Id (der echte Datei-Inhalt wandert in PROD über den Port). */
type LokaleDatei = { name: string; groesse: number };

/**
 * Nachweis-Upload — rendert je Nachweis eine eigene, tastaturbedienbare Dropzone mit Status.
 * Hält die gewählten Datei-Metadaten lokal und meldet jede Änderung über `onChange` nach oben.
 */
export function DateiUpload({
  nachweise,
  onChange,
  titel = "Nachweise hochladen",
  uploadStatus,
  onRegisterAbruf,
  className,
}: DateiUploadProps): ReactElement {
  const [dateien, setDateien] = useState<Record<string, LokaleDatei>>({});
  const [statusMeldung, setStatusMeldung] = useState<string>("");
  // M4 — Spiegel des Register-Autorisierungs-Status (die Autorisierungs-Karte verwaltet ihn selbst; hier nur für
  // die Fortschritts-Zählung im Kopf). Vor-autorisierte Nachweise (register.status) zählen sofort als erledigt.
  const [autorisiert, setAutorisiert] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      nachweise
        .filter(
          (n) =>
            n.register?.status === "autorisiert" ||
            n.register?.status === "abgerufen",
        )
        .map((n) => [n.id, true]),
    ),
  );

  const setDatei = (nachweis: Nachweis, datei: LokaleDatei | null) => {
    setDateien((prev) => {
      const next = { ...prev };
      if (datei) next[nachweis.id] = datei;
      else delete next[nachweis.id];
      return next;
    });
    onChange(nachweis.id, datei);
    setStatusMeldung(
      datei
        ? `${nachweis.label}: Datei "${datei.name}" (${formatGroesse(datei.groesse)}) hinzugefügt.`
        : `${nachweis.label}: Datei entfernt.`,
    );
  };

  // M4 — „erledigt" je Bezugsweg: upload = Datei da / serverseitig hochgeladen; register-once-only = autorisiert;
  // gefordert (nachzureichen) = jetzt weder offen noch erledigt (bewusst später).
  const istRegister = (n: Nachweis) =>
    nachweisBezugsweg(n) === "register-once-only";
  const istGefordert = (n: Nachweis) => nachweisBezugsweg(n) === "gefordert";
  const istErledigt = (n: Nachweis): boolean =>
    istRegister(n)
      ? !!autorisiert[n.id]
      : istGefordert(n)
        ? false
        : !!dateien[n.id] || n.hochgeladen;

  const offenePflicht = nachweise.filter(
    (n) => n.erforderlich && !istGefordert(n) && !istErledigt(n),
  ).length;
  const gesamt = nachweise.length;
  const erledigt = nachweise.filter(istErledigt).length;

  return (
    <section
      className={cn("rounded-md border border-border bg-card p-5", className)}
      aria-label={titel}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Paperclip
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            {titel}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {erledigt} von {gesamt} {gesamt === 1 ? "Nachweis" : "Nachweisen"}{" "}
            hinzugefügt
            {offenePflicht > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-status-block">
                  {offenePflicht} erforderlich offen
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Status-Meldungen für Screenreader (Datei hinzugefügt/entfernt) — höflich, nicht unterbrechend. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMeldung}
      </p>

      {nachweise.length === 0 ? (
        <p className="mt-4 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground">
          Für diesen Antrag sind keine Nachweise erforderlich.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {nachweise.map((nachweis) =>
            // M4 — je BEZUGSWEG eine andere UI: register-once-only = Autorisierungs-Karte (bestätigen statt
            // hochladen); upload/gefordert = Datei-Position (Dropzone bzw. „nachzureichen"-Hinweis).
            nachweisBezugsweg(nachweis) === "register-once-only" ? (
              <li key={nachweis.id}>
                <NachweisAutorisierung
                  nachweis={nachweis}
                  onAutorisieren={(id) => {
                    setAutorisiert((prev) => ({ ...prev, [id]: true }));
                    setStatusMeldung(
                      `${nachweis.label}: Registerabruf autorisiert.`,
                    );
                    onRegisterAbruf?.(id);
                  }}
                />
              </li>
            ) : (
              <li key={nachweis.id}>
                <NachweisZeile
                  nachweis={nachweis}
                  datei={dateien[nachweis.id]}
                  bereitsHochgeladen={nachweis.hochgeladen}
                  status={uploadStatus?.[nachweis.id]}
                  onPick={(datei) => setDatei(nachweis, datei)}
                  onRemove={() => setDatei(nachweis, null)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Übersetzt eine server-autoritative Phase in eine sprechende Ansage (Screenreader, zentral). */
function ansageFuerPhase(
  label: string,
  status: NachweisUploadStatus,
): string | null {
  switch (status.phase) {
    case "uploading":
      return typeof status.fortschritt === "number"
        ? `${label}: Wird hochgeladen, ${Math.round(status.fortschritt)} Prozent.`
        : `${label}: Wird hochgeladen.`;
    case "scanning":
      return `${label}: Datei wird auf Viren geprüft.`;
    case "rejected":
      return `${label}: Abgelehnt. ${status.meldung ?? "Die Datei wurde nicht angenommen."}`;
    default:
      return null;
  }
}

/** Eine einzelne Nachweis-Position: Dropzone (leer) ODER Datei-Karte (befüllt) + Status-Badge. */
function NachweisZeile({
  nachweis,
  datei,
  bereitsHochgeladen,
  status,
  onPick,
  onRemove,
}: {
  nachweis: Nachweis;
  datei: LokaleDatei | undefined;
  bereitsHochgeladen: boolean;
  status: NachweisUploadStatus | undefined;
  onPick: (datei: LokaleDatei) => void;
  onRemove: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const anforderungId = useId();
  const fehlerId = useId();
  const statusFehlerId = useId();
  const einschraenkungId = useId();

  // DATEN-getriebene Einschränkungen (Typ/Größe): steuern das native `accept`, den sichtbaren Hinweis und die
  // Fail-Fast-Vorprüfung. Fehlen sie am Nachweis, verhält sich die Position exakt wie bisher.
  const accept = nachweisAcceptAttribut(nachweis);
  const einschraenkungenText = nachweisEinschraenkungenText(nachweis);

  const { announce } = useStatusRegion();
  const [dragOver, setDragOver] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Server-autoritative Detail-Zustände ableiten (alles OPTIONAL — fehlt der Status, verhält es sich wie bisher).
  const phase = status?.phase ?? "idle";
  const laeuft = phase === "uploading" || phase === "scanning";
  const abgelehnt = phase === "rejected";
  const fortschritt = phase === "uploading" ? status?.fortschritt : undefined;

  // Phasenwechsel + Fortschritt ZENTRAL ansagen (useStatusRegion) — eine Wahrheit, nicht je Widget verstreut.
  const letzteAnsage = useRef<string | null>(null);
  useEffect(() => {
    if (!status) {
      letzteAnsage.current = null;
      return;
    }
    const text = ansageFuerPhase(nachweis.label, status);
    if (text && text !== letzteAnsage.current) {
      letzteAnsage.current = text;
      announce(text, status.phase === "rejected" ? "assertive" : "polite");
    }
  }, [announce, nachweis.label, status]);

  const istHochgeladen = !!datei || bereitsHochgeladen;
  const erforderlich = !!nachweis.erforderlich;
  // M4 — `gefordert`: der Nachweis ist NACHZUREICHEN (wird später verlangt) — jetzt KEIN Upload, kein Dropzone.
  const gefordert = nachweisBezugsweg(nachweis) === "gefordert";

  const verarbeiteDatei = (file: File | undefined | null) => {
    if (!file) return;
    // Fail-Fast gegen die DATEN-Einschränkungen (Typ/Größe) — der Server bleibt autoritativ (Format/Größe/Virus),
    // aber ein offensichtlich unzulässiger Upload wird gar nicht erst gestartet und sofort erklärt.
    const pruef = pruefeNachweisDatei(nachweis, {
      name: file.name,
      groesse: file.size,
      typ: file.type,
    });
    if (pruef) {
      setFehler(pruef.meldung);
      announce(`${nachweis.label}: ${pruef.meldung}`, "assertive");
      return;
    }
    setFehler(null);
    onPick({ name: file.name, groesse: file.size });
  };

  const oeffneDialog = () => {
    setFehler(null);
    inputRef.current?.click();
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) {
      setFehler(
        "Es konnte keine Datei aus dem abgelegten Inhalt gelesen werden.",
      );
      return;
    }
    verarbeiteDatei(file);
  };

  const onDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  // M4 — GEFORDERT (nachzureichen): kompakte Karte OHNE Upload — ein „Nachzureichen"-Badge + Erklärung, dass der
  // Nachweis später verlangt wird. Kein Dropzone, kein File-Input (der Antrag wird dadurch nicht blockiert).
  if (gefordert) {
    return (
      <div className="rounded-md border border-status-warn/40 bg-status-warn-soft/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {nachweis.label}
              </span>
              {erforderlich ? (
                <span className="rounded-sm border border-status-block/30 bg-status-block-soft px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-status-block">
                  Erforderlich
                </span>
              ) : (
                <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Optional
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Dieser Nachweis wird später angefordert — Sie müssen jetzt nichts
              hochladen.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-warn">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Nachzureichen
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3 transition-colors motion-reduce:transition-none",
        istHochgeladen
          ? "border-status-ok/40 bg-status-ok-soft/40"
          : erforderlich
            ? "border-status-block/40"
            : "border-border",
      )}
    >
      {/* Kopf: Bezeichnung + Pflicht-/Status-Markierung */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {nachweis.label}
            </span>
            {erforderlich ? (
              <span className="rounded-sm border border-status-block/30 bg-status-block-soft px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-status-block">
                Erforderlich
              </span>
            ) : (
              <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p id={anforderungId} className="mt-1 text-sm text-muted-foreground">
            {istHochgeladen
              ? "Beleg hinzugefügt — Sie können ihn ersetzen oder entfernen."
              : "Ziehen Sie eine Datei hierher oder wählen Sie eine Datei aus, um diesen Nachweis zu erbringen."}
          </p>
          {einschraenkungenText && (
            <p
              id={einschraenkungId}
              className="mt-0.5 text-xs text-muted-foreground"
            >
              {einschraenkungenText}
            </p>
          )}
        </div>

        {/* Status-Badge: laufend/abgelehnt haben Vorrang vor „Hochgeladen" (server-autoritativ). */}
        {phase === "uploading" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-info">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Wird hochgeladen
          </span>
        ) : phase === "scanning" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-info">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Virenscan läuft
          </span>
        ) : abgelehnt ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-block">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Abgelehnt
          </span>
        ) : (
          istHochgeladen && (
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-ok">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Hochgeladen
            </span>
          )
        )}
      </div>

      {/* Verstecktes natives File-Input — wird vom Button/Dropzone-Button getriggert (Maus + Tastatur). */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        aria-describedby={cn(
          anforderungId,
          einschraenkungenText ? einschraenkungId : undefined,
        )}
        onChange={(e) => {
          verarbeiteDatei(e.target.files?.[0]);
          // Eingabe leeren, damit dieselbe Datei erneut gewählt werden kann (löst sonst kein change-Event aus).
          e.target.value = "";
        }}
      />

      {/* ── Server-autoritativer Detail-Zustand: Übertragung läuft (mit/ohne Fortschritt) ── */}
      {phase === "uploading" && (
        <div className="mt-3 rounded-sm border border-status-info/40 bg-status-info-soft/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2
              className="h-4 w-4 shrink-0 text-status-info animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>
              Datei wird hochgeladen
              {typeof fortschritt === "number"
                ? ` — ${Math.round(fortschritt)} %`
                : "…"}
            </span>
          </div>
          {typeof fortschritt === "number" && (
            <Progress
              value={fortschritt}
              aria-label={`Upload-Fortschritt für ${nachweis.label}`}
              className="mt-2"
            />
          )}
        </div>
      )}

      {/* ── Server-autoritativer Detail-Zustand: Virenscan / serverseitige Prüfung läuft ── */}
      {phase === "scanning" && (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-status-info/40 bg-status-info-soft/40 p-3 text-sm font-medium text-foreground">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-status-info"
            aria-hidden="true"
          />
          <Loader2
            className="h-4 w-4 shrink-0 text-status-info animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>Datei wird auf Viren geprüft…</span>
        </div>
      )}

      {/* ── Server-autoritativer Detail-Zustand: abgelehnt (Format/Größe/Virus) ── */}
      {abgelehnt && (
        <div
          id={statusFehlerId}
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-sm border border-status-block/40 bg-status-block-soft/50 p-3"
        >
          {status?.grund === "virus" ? (
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-status-block"
              aria-hidden="true"
            />
          ) : (
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-status-block"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-status-block">
              {status?.grund === "virus"
                ? "Sicherheitsprüfung fehlgeschlagen — Datei abgelehnt"
                : status?.grund === "format"
                  ? "Dateiformat nicht zulässig — Datei abgelehnt"
                  : status?.grund === "groesse"
                    ? "Datei zu groß — Datei abgelehnt"
                    : "Datei abgelehnt"}
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {status?.meldung ??
                "Bitte wählen Sie eine andere Datei und versuchen Sie es erneut."}
            </p>
          </div>
        </div>
      )}

      {laeuft ? null : istHochgeladen && datei ? (
        // ── Befüllte Position: Datei-Karte mit Name/Größe + Ersetzen/Entfernen ──
        <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileUp
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div
                className="truncate text-sm font-medium text-foreground"
                title={datei.name}
              >
                {datei.name}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {formatGroesse(datei.groesse)}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={oeffneDialog}
              aria-describedby={anforderungId}
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Ersetzen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              aria-label={`Datei "${datei.name}" für ${nachweis.label} entfernen`}
              className="text-status-block hover:text-status-block"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Entfernen
            </Button>
          </div>
        </div>
      ) : istHochgeladen ? (
        // ── Bereits serverseitig hochgeladen (kein lokales File-Objekt): nur Ersetzen anbieten ──
        <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-2.5">
          <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <FileUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            Beleg liegt bereits vor.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={oeffneDialog}
            aria-describedby={anforderungId}
          >
            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
            Neu hochladen
          </Button>
        </div>
      ) : (
        // ── Leere Position: tastaturbedienbare Dropzone (echter Button, KEIN reines Drag-Only) ──
        <button
          type="button"
          onClick={oeffneDialog}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          aria-label={
            abgelehnt
              ? `Andere Datei für ${nachweis.label} auswählen oder hierher ziehen`
              : `Datei für ${nachweis.label} auswählen oder hierher ziehen`
          }
          aria-describedby={cn(
            anforderungId,
            einschraenkungenText ? einschraenkungId : undefined,
            fehler ? fehlerId : undefined,
            abgelehnt ? statusFehlerId : undefined,
          )}
          className={cn(
            "mt-3 flex min-h-[3rem] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            dragOver
              ? "border-accent bg-accent/10 text-foreground"
              : "border-border bg-background text-muted-foreground hover:border-accent/60 hover:bg-secondary/40",
          )}
        >
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            Datei hierher ziehen oder auswählen
          </span>
          <span className="text-xs text-muted-foreground">
            Per Klick oder Eingabetaste den Datei-Dialog öffnen
          </span>
        </button>
      )}

      {fehler && (
        <p
          id={fehlerId}
          role="alert"
          className="mt-2 text-sm text-status-block"
        >
          {fehler}
        </p>
      )}
    </div>
  );
}
