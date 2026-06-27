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
import { useId, useRef, useState, type DragEvent, type ReactElement } from "react";
import { CheckCircle2, FileUp, Paperclip, Trash2, UploadCloud } from "lucide-react";

import type { Nachweis } from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

export interface DateiUploadProps {
  /** Die erforderlichen/optionalen Nachweise (data-driven, z.B. aus `config.nachweise(antragsdaten)`). */
  nachweise: Nachweis[];
  /**
   * Wird bei jeder Änderung einer Position gerufen: `datei` = die gewählte Datei (Name + Größe in Bytes),
   * oder `null`, wenn die Position geleert/entfernt wurde.
   */
  onChange: (id: string, datei: { name: string; groesse: number } | null) => void;
  /** Optionale Überschrift (generisch, ohne Domänen-Bezug). */
  titel?: string;
  className?: string;
}

/** Bytes menschenlesbar formatieren (de-DE, dep-frei). */
function formatGroesse(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const einheiten = ["KB", "MB", "GB", "TB"];
  let wert = bytes / 1024;
  let i = 0;
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024;
    i += 1;
  }
  const gerundet = wert >= 10 || Number.isInteger(wert) ? Math.round(wert) : Math.round(wert * 10) / 10;
  return `${new Intl.NumberFormat("de-DE").format(gerundet)} ${einheiten[i]}`;
}

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
  className,
}: DateiUploadProps): ReactElement {
  const [dateien, setDateien] = useState<Record<string, LokaleDatei>>({});
  const [statusMeldung, setStatusMeldung] = useState<string>("");

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
        ? `${nachweis.label}: Datei „${datei.name}" (${formatGroesse(datei.groesse)}) hinzugefügt.`
        : `${nachweis.label}: Datei entfernt.`,
    );
  };

  const offenePflicht = nachweise.filter((n) => n.erforderlich && !dateien[n.id] && !n.hochgeladen).length;
  const gesamt = nachweise.length;
  const erledigt = nachweise.filter((n) => !!dateien[n.id] || n.hochgeladen).length;

  return (
    <section
      className={cn("rounded-md border border-border bg-card p-5", className)}
      aria-label={titel}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {titel}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {erledigt} von {gesamt} {gesamt === 1 ? "Nachweis" : "Nachweisen"} hinzugefügt
            {offenePflicht > 0 && (
              <>
                {" "}· <span className="text-status-block">{offenePflicht} erforderlich offen</span>
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
          {nachweise.map((nachweis) => (
            <li key={nachweis.id}>
              <NachweisZeile
                nachweis={nachweis}
                datei={dateien[nachweis.id]}
                bereitsHochgeladen={nachweis.hochgeladen}
                onPick={(datei) => setDatei(nachweis, datei)}
                onRemove={() => setDatei(nachweis, null)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Eine einzelne Nachweis-Position: Dropzone (leer) ODER Datei-Karte (befüllt) + Status-Badge. */
function NachweisZeile({
  nachweis,
  datei,
  bereitsHochgeladen,
  onPick,
  onRemove,
}: {
  nachweis: Nachweis;
  datei: LokaleDatei | undefined;
  bereitsHochgeladen: boolean;
  onPick: (datei: LokaleDatei) => void;
  onRemove: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const anforderungId = useId();
  const fehlerId = useId();

  const [dragOver, setDragOver] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const istHochgeladen = !!datei || bereitsHochgeladen;
  const erforderlich = !!nachweis.erforderlich;

  const verarbeiteDatei = (file: File | undefined | null) => {
    if (!file) return;
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
      setFehler("Es konnte keine Datei aus dem abgelegten Inhalt gelesen werden.");
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
            <span className="text-sm font-medium text-foreground">{nachweis.label}</span>
            {erforderlich ? (
              <span className="rounded-sm border border-status-block/30 bg-status-block-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-block">
                Erforderlich
              </span>
            ) : (
              <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p id={anforderungId} className="mt-1 text-[12px] text-muted-foreground">
            {istHochgeladen
              ? "Beleg hinzugefügt — Sie können ihn ersetzen oder entfernen."
              : "Ziehen Sie eine Datei hierher oder wählen Sie eine Datei aus, um diesen Nachweis zu erbringen."}
          </p>
        </div>

        {istHochgeladen && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-status-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Hochgeladen
          </span>
        )}
      </div>

      {/* Verstecktes natives File-Input — wird vom Button/Dropzone-Button getriggert (Maus + Tastatur). */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        aria-describedby={anforderungId}
        onChange={(e) => {
          verarbeiteDatei(e.target.files?.[0]);
          // Eingabe leeren, damit dieselbe Datei erneut gewählt werden kann (löst sonst kein change-Event aus).
          e.target.value = "";
        }}
      />

      {istHochgeladen && datei ? (
        // ── Befüllte Position: Datei-Karte mit Name/Größe + Ersetzen/Entfernen ──
        <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground" title={datei.name}>
                {datei.name}
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground">
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
              aria-label={`Datei „${datei.name}" für ${nachweis.label} entfernen`}
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
          <span className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
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
          aria-label={`Datei für ${nachweis.label} auswählen oder hierher ziehen`}
          aria-describedby={cn(anforderungId, fehler ? fehlerId : undefined)}
          className={cn(
            "mt-3 flex min-h-[3rem] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            dragOver
              ? "border-accent bg-accent/10 text-foreground"
              : "border-border bg-background text-muted-foreground hover:border-accent/60 hover:bg-secondary/40",
          )}
        >
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
          <span className="text-[13px] font-medium text-foreground">
            Datei hierher ziehen oder auswählen
          </span>
          <span className="text-[11px] text-muted-foreground">
            Per Klick oder Eingabetaste den Datei-Dialog öffnen
          </span>
        </button>
      )}

      {fehler && (
        <p id={fehlerId} role="alert" className="mt-2 text-[12px] text-status-block">
          {fehler}
        </p>
      )}
    </div>
  );
}
