// fachverfahren-kit/components/NachweisAutorisierung — M4: die REGISTER-ONCE-ONLY-Autorisierungs-Karte.
//
// Statt eines Uploads: der Nachweis liegt bereits in einem Register vor. Der/die Bürger:in AUTORISIERT nur den
// Abruf (Once-Only-Prinzip — die Daten werden nicht erneut verlangt) — es wird NICHTS hochgeladen. Nach der
// Autorisierung zeigt die Karte „aus Register bezogen" + Provenienz (Quelle/Rechtsgrundlage). VOLLSTÄNDIG
// DATEN-getrieben (`Nachweis.register`) — KEINE Domänen-Literale. BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echter
// Button, aria-live-Statuswechsel (zentral über useStatusRegion), Status nie NUR über Farbe (immer + Text/Icon),
// sichtbarer Fokus, ausreichende Zielgröße. Respektiert prefers-reduced-motion (keine erzwungene Animation).
import { useId, useState, type ReactElement } from "react";
import { CheckCircle2, DatabaseZap, Info, ShieldCheck } from "lucide-react";

import type { Nachweis } from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface NachweisAutorisierungProps {
  /** Der Register-Once-Only-Nachweis (mit `register`-Bezug: Quelle/Rechtsgrundlage/Einwilligung/Status). */
  nachweis: Nachweis;
  /** Wird gerufen, sobald der/die Bürger:in den Registerabruf autorisiert (id des Nachweises). Optional. */
  onAutorisieren?: ((id: string) => void) | undefined;
  className?: string;
}

/** Register-Once-Only-Karte: bestätigen statt hochladen. Selbstverwaltend (Autorisierungs-Status intern), meldet
 *  die Autorisierung nach oben (`onAutorisieren`) und zeigt danach die Provenienz „aus Register bezogen". */
export function NachweisAutorisierung({
  nachweis,
  onAutorisieren,
  className,
}: NachweisAutorisierungProps): ReactElement {
  const register = nachweis.register;
  const bereitsAbgerufen = register?.status === "abgerufen";
  const [autorisiert, setAutorisiert] = useState(
    () =>
      register?.status === "autorisiert" || register?.status === "abgerufen",
  );
  const { announce } = useStatusRegion();
  const titelId = useId();
  const beschreibungId = useId();
  const erforderlich = !!nachweis.erforderlich;
  const quelle = register?.quelle ?? "Register";

  const autorisieren = () => {
    setAutorisiert(true);
    onAutorisieren?.(nachweis.id);
    announce(
      `${nachweis.label}: Registerabruf autorisiert — aus ${quelle} bezogen, ohne Upload.`,
      "polite",
    );
  };

  return (
    <section
      aria-labelledby={titelId}
      className={cn(
        "rounded-md border p-4 transition-colors motion-reduce:transition-none",
        autorisiert
          ? "border-status-ok/40 bg-status-ok-soft/40"
          : erforderlich
            ? "border-status-info/40 bg-status-info-soft/30"
            : "border-border",
        className,
      )}
    >
      {/* Kopf: Bezeichnung + Pflicht/Optional + Once-Only-Kennzeichnung */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DatabaseZap
              className="h-4 w-4 shrink-0 text-status-info"
              aria-hidden="true"
            />
            <span id={titelId} className="text-sm font-medium text-foreground">
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
            <span className="rounded-sm border border-status-info/30 bg-status-info-soft px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-status-info">
              Once-Only
            </span>
          </div>
          <p id={beschreibungId} className="mt-1 text-sm text-muted-foreground">
            {autorisiert
              ? `Aus dem Register „${quelle}" bezogen — Sie mussten nichts hochladen.`
              : `Dieser Nachweis liegt bereits im Register „${quelle}" vor. Bitte bestätigen Sie den Abruf — ein Upload ist nicht nötig.`}
          </p>
        </div>

        {autorisiert && (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Aus Register bezogen
          </span>
        )}
      </div>

      {/* Provenienz: Quelle + Rechtsgrundlage (als DATEN aus dem Nachweis). */}
      {register && (
        <dl className="mt-3 grid gap-1 text-xs">
          <div className="flex flex-wrap gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">
              Quelle
            </dt>
            <dd className="text-foreground">{register.quelle}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">
              Rechtsgrundlage
            </dt>
            <dd className="text-foreground">{register.rechtsgrundlage}</dd>
          </div>
        </dl>
      )}

      {!autorisiert ? (
        <div className="mt-4">
          {register?.einwilligung?.erforderlich &&
            register.einwilligung.text && (
              <p className="mb-3 flex items-start gap-2 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{register.einwilligung.text}</span>
              </p>
            )}
          <Button
            type="button"
            onClick={autorisieren}
            aria-describedby={beschreibungId}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {register?.einwilligung?.erforderlich
              ? "Einwilligen und Abruf autorisieren"
              : "Registerabruf autorisieren"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-status-ok/40 bg-status-ok-soft/40 p-2.5 text-sm text-foreground">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-status-ok"
            aria-hidden="true"
          />
          <span>
            {bereitsAbgerufen
              ? "Nachweis aus dem Register abgerufen."
              : "Abruf autorisiert — der Nachweis wird aus dem Register bezogen."}
          </span>
        </div>
      )}
    </section>
  );
}
