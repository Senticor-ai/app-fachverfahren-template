// fachverfahren-kit/components/ConfirmDialog — Bestätigung destruktiver/bindender Aktionen + Sitzungs-Timeout-Warnung.
//
// Zwei modale Entscheidungs-Dialoge auf Basis von ../ui/alert-dialog.js (Radix AlertDialog): erzwungene
// Entscheidung, Fokus-Trap, Fokus-Rückgabe und Escape werden von Radix verdrahtet — keine eigene Modal-Logik.
//
// GENERISCH + DEP-FREI: keine Domänen-Literale, alle veränderlichen Texte (Titel/Beschreibung/Labels) kommen
// aus Props; nur React + die Kit-Primitive. Die Gefährlichkeit destruktiver Aktionen wird über Variante UND
// Text getragen (nie nur Farbe).
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echte <button> (über den Kit-Button), Radix liefert role="alertdialog"
// + aria-labelledby/aria-describedby und Fokus-Trap; Icons sind dekorativ (aria-hidden); die Rest-Zeit der
// Sitzungs-Warnung wird über eine höfliche Live-Region (aria-live="polite") angesagt; Animationen respektieren
// motion-reduce (in den Primitiven gesetzt). Standard-Button-Höhe erfüllt die Ziel-Größe >= 24px.
"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog.js";

// ── 1. ConfirmDialog — Bestätigung einer destruktiven/bindenden Aktion ───────────────────────────

export interface ConfirmDialogProps {
  /** Sichtbarkeit (kontrolliert). */
  open: boolean;
  /** Wird gerufen, wenn Radix den Dialog öffnen/schließen will (Esc, Cancel, Aktion). */
  onOpenChange: (open: boolean) => void;
  /** Kurze, eindeutige Frage/Überschrift — beschreibt die Folge der Aktion. */
  title: string;
  /** Erläuternder Kontext (was passiert, was unwiderruflich ist). Optional. */
  description?: ReactNode;
  /** Beschriftung des Bestätigen-Buttons (Standard: "Bestätigen"). */
  confirmLabel?: string;
  /** Beschriftung des Abbrechen-Buttons (Standard: "Abbrechen"). */
  cancelLabel?: string;
  /** Markiert die Aktion als gefährlich (destruktive Variante + warnendes Symbol). */
  destructive?: boolean;
  /** Wird beim Bestätigen ausgeführt. Der Dialog schließt anschließend selbst (über Radix). */
  onConfirm: () => void;
}

/**
 * Modaler Bestätigungs-Dialog für Aktionen, die nicht versehentlich passieren dürfen
 * (Löschen, Einreichen, Abschicken). Erzwingt eine bewusste Ja/Nein-Entscheidung.
 *
 * Bei `destructive` führt der Bestätigen-Button optisch (destruktive Variante) UND wird durch
 * ein warnendes Symbol begleitet — die Gefahr ist also nicht nur farblich erkennbar.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const hasDescription = description != null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Ohne Beschreibung: explizit aria-describedby={undefined}, damit Radix die fehlende (zulässige)
          Description als Absicht erkennt und keine A11y-Konsolen-Warnung wirft. Mit Beschreibung verdrahtet
          Radix aria-describedby selbst über die <AlertDialogDescription>, daher kein Override. */}
      <AlertDialogContent
        {...(hasDescription ? {} : { "aria-describedby": undefined })}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 sm:justify-start justify-center">
            {destructive ? (
              <AlertTriangle
                aria-hidden="true"
                className="size-5 shrink-0 text-status-block"
              />
            ) : null}
            <span>{title}</span>
          </AlertDialogTitle>
          {hasDescription ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
ConfirmDialog.displayName = "ConfirmDialog";

// ── 2. SessionTimeoutDialog — Inaktivitäts-Warnung vor automatischem Abmelden ────────────────────

export interface SessionTimeoutDialogProps {
  /** Sichtbarkeit (kontrolliert) — typischerweise gesetzt, wenn nur noch wenig Zeit bleibt. */
  open: boolean;
  /** Verbleibende Sekunden bis zur automatischen Abmeldung. */
  secondsLeft: number;
  /** Verlängert die Sitzung (setzt die Inaktivität zurück). */
  onExtend: () => void;
  /** Meldet sofort ab. */
  onLogout: () => void;
}

/**
 * Warnt vor der automatischen Abmeldung nach Inaktivität und bietet "Sitzung verlängern" oder "Abmelden".
 *
 * WICHTIG für die einbindende App: Vor Ablauf der Frist sollte ein offener Entwurf automatisch gesichert
 * werden (z. B. über SaveIndicator/onSaveNow), damit beim Timeout keine Eingaben verloren gehen.
 *
 * Dieser Dialog ist absichtlich NICHT per Esc/Klick schließbar (`onOpenChange` no-op): Der Nutzer muss
 * aktiv verlängern oder abmelden, sonst greift der externe Timer.
 */
export function SessionTimeoutDialog({
  open,
  secondsLeft,
  onExtend,
  onLogout,
}: SessionTimeoutDialogProps) {
  const remaining = Math.max(0, Math.floor(secondsLeft));
  const countdownText = formatRemaining(remaining);

  return (
    <AlertDialog open={open} onOpenChange={NOOP_OPEN_CHANGE}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 sm:justify-start justify-center">
            <AlertTriangle
              aria-hidden="true"
              className="size-5 shrink-0 text-status-warn"
            />
            <span>Ihre Sitzung läuft bald ab</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            Aus Sicherheitsgründen werden Sie nach Inaktivität automatisch
            abgemeldet. Verlängern Sie die Sitzung, um weiterzuarbeiten. Nicht
            gespeicherte Eingaben werden vor der Abmeldung gesichert.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Höfliche Live-Region: sagt die Rest-Zeit an, ohne andere Ansagen zu unterbrechen. */}
        <p
          aria-live="polite"
          aria-atomic="true"
          className="rounded-md bg-status-warn-soft px-3 py-2 text-center text-sm font-medium text-foreground"
        >
          Verbleibende Zeit:{" "}
          <span className="tabular-nums">{countdownText}</span>
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLogout}>Abmelden</AlertDialogCancel>
          <AlertDialogAction variant="default" onClick={onExtend}>
            Sitzung verlängern
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
SessionTimeoutDialog.displayName = "SessionTimeoutDialog";

const NOOP_OPEN_CHANGE = (_open: boolean): void => undefined;

/** Formatiert verbleibende Sekunden barrierefrei als "m:ss" bzw. "s Sekunden". */
function formatRemaining(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} ${totalSeconds === 1 ? "Sekunde" : "Sekunden"}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} Minuten`;
}
