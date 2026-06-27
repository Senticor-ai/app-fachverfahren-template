// components/ConsentBanner — der GENERISCHE DSGVO-Consent-Banner der Bürger-Sicht.
//
// Zeigt sich genau dann, wenn noch KEINE Entscheidung gespeichert ist, und verschwindet nach der Wahl
// dauerhaft (localStorage, Schlüssel "fv-consent"). Beide Optionen sind GLEICHWERTIG prominent gestaltet
// (kein Dark-Pattern, kein vorausgewähltes „Alle akzeptieren", keine versteckte Ablehnung) — Art. 7 DSGVO.
// Vollständig dep-frei: nur React + Tailwind + die Token-getriebenen Bestands-Klassen. KEIN Domänen-Literal.
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - role="dialog" + aria-modal, beschriftet/beschrieben über aria-labelledby/aria-describedby
//  - Fokus wandert beim Erscheinen in den Banner, Fokus-Falle (Tab/Shift+Tab zyklisch), Esc = „Notwendige"
//  - sichtbarer Fokus-Ring (focus-visible:ring), Zielgröße der Buttons >= 24px (h-9)
//  - prefers-reduced-motion wird über die transition-Klassen respektiert (motion-reduce:transition-none)
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

// localStorage-Schlüssel — eine bewusste Konstante (kein Domänen-Inhalt, verfahrensübergreifend gleich).
const CONSENT_KEY = "fv-consent";

/** Persistierte Entscheidung. `false` = nur notwendige, `true` = alle akzeptiert. */
type GespeicherteEntscheidung = "notwendige" | "alle";

/** Liest die gespeicherte Entscheidung defensiv (SSR-/Privatmodus-sicher) — null = noch keine Wahl. */
function leseEntscheidung(): GespeicherteEntscheidung | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const roh = window.localStorage.getItem(CONSENT_KEY);
    return roh === "alle" || roh === "notwendige" ? roh : null;
  } catch {
    // Zugriff kann im Privatmodus/aus Policy-Gründen werfen — dann zeigen wir den Banner (sichere Default-Wahl).
    return null;
  }
}

/** Schreibt die Entscheidung defensiv — ein fehlschlagender Storage darf den Flow nicht crashen. */
function speichereEntscheidung(wert: GespeicherteEntscheidung): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CONSENT_KEY, wert);
  } catch {
    // bewusst geschluckt — die UI schließt trotzdem, der Nutzer wird nicht blockiert.
  }
}

export interface ConsentBannerProps {
  /** Wird mit der Entscheidung gerufen: `true` = „Alle akzeptieren", `false` = „Notwendige". */
  onEntscheidung?: (akzeptiert: boolean) => void;
  /** Optionaler Link zur Datenschutzerklärung. Fehlt er, wird kein Link gerendert. */
  datenschutzUrl?: string;
}

/**
 * Der DSGVO-Consent-Banner. Rendert `null`, solange bereits eine Entscheidung vorliegt — der erste echte
 * Render erfolgt erst nach dem Mount (kein localStorage zur SSR-Zeit), damit Server- und Client-Markup
 * deckungsgleich bleiben (keine Hydration-Diskrepanz).
 */
export function ConsentBanner({
  onEntscheidung,
  datenschutzUrl,
}: ConsentBannerProps): React.ReactElement | null {
  // `null` bis zum Mount → vor der ersten Storage-Prüfung wird nichts gerendert (SSR-sicher).
  const [sichtbar, setSichtbar] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const erstesButtonRef = useRef<HTMLButtonElement | null>(null);
  // Fokus vor dem Erscheinen merken, um ihn beim Schließen zurückzugeben (Fokus-Management).
  const vorherigerFokus = useRef<Element | null>(null);

  const titelId = useId();
  const beschreibungId = useId();

  // Nach dem Mount: gespeicherte Wahl prüfen → Banner nur ohne Entscheidung zeigen.
  useEffect(() => {
    setSichtbar(leseEntscheidung() === null);
  }, []);

  const entscheiden = useCallback(
    (akzeptiert: boolean) => {
      speichereEntscheidung(akzeptiert ? "alle" : "notwendige");
      setSichtbar(false);
      onEntscheidung?.(akzeptiert);
    },
    [onEntscheidung],
  );

  // Fokus-Management + Fokus-Falle + Esc, solange der Banner sichtbar ist.
  useEffect(() => {
    if (sichtbar !== true) return;

    vorherigerFokus.current = typeof document !== "undefined" ? document.activeElement : null;
    // Fokus in den Banner setzen (auf den ersten, gleichwertigen Button).
    erstesButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Esc = die datenschutzfreundliche Default-Wahl „Notwendige" (niemals stille Voll-Zustimmung).
        entscheiden(false);
        return;
      }
      if (e.key !== "Tab") return;

      // Fokus-Falle: Tab zyklisch innerhalb des Banners halten.
      const container = containerRef.current;
      if (!container) return;
      const fokussierbare = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (fokussierbare.length === 0) return;
      const erstes = fokussierbare[0]!;
      const letztes = fokussierbare[fokussierbare.length - 1]!;
      const aktiv = document.activeElement;

      if (e.shiftKey) {
        if (aktiv === erstes || !container.contains(aktiv)) {
          e.preventDefault();
          letztes.focus();
        }
      } else if (aktiv === letztes || !container.contains(aktiv)) {
        e.preventDefault();
        erstes.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Fokus zurück an das Element vor dem Banner (sofern noch im DOM).
      const ziel = vorherigerFokus.current;
      if (ziel instanceof HTMLElement && document.contains(ziel)) ziel.focus();
    };
  }, [sichtbar, entscheiden]);

  if (sichtbar !== true) return null;

  return (
    // Bodenständiger, nicht-blockierender Banner (kein verdunkelnder Overlay-Zwang) am unteren Rand.
    // aria-modal bleibt true, da Fokus + Esc den Banner wie einen modalen Dialog behandeln.
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titelId}
      aria-describedby={beschreibungId}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur",
        "shadow-[0_-2px_12px_rgba(0,0,0,0.06)] motion-reduce:transition-none",
      )}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id={titelId} className="text-sm font-semibold text-foreground">
              Datenschutz-Einstellungen
            </h2>
            <p id={beschreibungId} className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Wir verwenden ausschließlich notwendige Daten, damit dieser Dienst funktioniert. Optionale Daten
              (z. B. zur Reichweitenmessung) nutzen wir nur mit Ihrer Einwilligung. Sie können frei wählen und
              Ihre Entscheidung jederzeit ändern.
              {datenschutzUrl && (
                <>
                  {" "}
                  <a
                    href={datenschutzUrl}
                    className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    Zur Datenschutzerklärung
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        </div>

        {/* Beide Optionen GLEICHWERTIG prominent — gleiche Größe/Gewichtung, keine vorselektierte Wahl. */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            ref={erstesButtonRef}
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => entscheiden(false)}
          >
            Notwendige
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            onClick={() => entscheiden(true)}
          >
            Alle akzeptieren
          </Button>
        </div>
      </div>
    </div>
  );
}
