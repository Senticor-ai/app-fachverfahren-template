// components/InstallPrompt — der GENERISCHE, dezente „App installieren"-Hinweis (PWA).
//
// Fängt das browser-eigene `beforeinstallprompt`-Event ab, unterdrückt das aufdringliche Default-Banner und
// bietet stattdessen einen seriösen, token-getriebenen Hinweis (Card) mit einem „App installieren"-Button an.
// Lehnt der/die Nutzer:in ab, merken wir das dauerhaft (localStorage) und zeigen den Hinweis nicht erneut.
// Nimmt der/die Nutzer:in an, lösen wir den nativen Installations-Dialog aus und blenden uns danach aus.
//
// Vollständig dep-frei: nur React + Tailwind-Token-Klassen + lucide + die Bestands-Primitive (Card/Button).
// KEIN Domänen-Literal — App-Name/Texte kommen ausschließlich über props (mit neutralen, generischen Defaults).
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - role="region" + aria-labelledby/aria-describedby; sichtbarer Titel + erklärender Text
//  - alle Bedienelemente sind echte <button> mit aria-label/sichtbarem Text, Zielgröße >= 44px
//  - sichtbarer Fokus-Ring (focus-visible:ring-2 ring-ring ring-offset-2), Tastatur voll bedienbar
//  - Farbe ist NIE alleiniger Bedeutungsträger (Icon + Text), Kontrast token-getrieben (>= 4.5:1)
//  - keine verspielte Bewegung; Übergänge respektieren prefers-reduced-motion (motion-reduce:*)
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { isAppInstalled } from "./pwa.js";

// localStorage-Schlüssel — bewusste, verfahrensübergreifend gleiche Konstante (kein Domänen-Inhalt).
const DISMISS_KEY = "fv-pwa-install-dismissed";

/**
 * Das vom Browser ausgelöste `beforeinstallprompt`-Event. Es ist (noch) nicht in den Standard-Lib-Typen,
 * daher hier minimal und präzise selbst typisiert — kein externes Typ-Paket nötig.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

/** Liest die gemerkte Ablehnung defensiv (SSR-/Privatmodus-sicher) — true = der Nutzer hat abgelehnt. */
function leseAbgelehnt(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Storage kann im Privatmodus/aus Policy-Gründen werfen — dann behandeln wir es als „nicht abgelehnt".
    return false;
  }
}

/** Schreibt die Ablehnung defensiv — ein fehlschlagender Storage darf den Flow nicht crashen. */
function speichereAbgelehnt(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // bewusst geschluckt — die UI schließt trotzdem, der Nutzer wird nicht blockiert.
  }
}

export interface InstallPromptProps {
  /** Überschrift des Hinweises. Default: neutral „App installieren". */
  titel?: string;
  /** Erklärender Fließtext unter der Überschrift. Default: generischer, seriöser Verwaltungs-Text. */
  beschreibung?: string;
  /** Beschriftung des Annahme-Buttons. Default: „App installieren". */
  installLabel?: string;
  /** Beschriftung des Ablehnen-Buttons. Default: „Nicht jetzt". */
  ablehnenLabel?: string;
  /** Zusätzliche Klassen für den äußeren Container (z. B. Positionierung durch den Aufrufer). */
  className?: string;
}

/**
 * Der dezente PWA-Installations-Hinweis. Rendert `null`, bis ein echtes `beforeinstallprompt`-Event vorliegt,
 * die App nicht bereits installiert ist UND der/die Nutzer:in nicht zuvor abgelehnt hat. So erscheint der
 * Hinweis nur, wenn eine Installation tatsächlich möglich und erwünscht ist — niemals aufdringlich.
 */
export function InstallPrompt({
  titel = "App installieren",
  beschreibung = "Installieren Sie diesen Dienst als App auf Ihrem Gerät — für schnelleren Zugriff und eine Nutzung auch bei schwacher Verbindung. Sie können die App jederzeit wieder entfernen.",
  installLabel = "App installieren",
  ablehnenLabel = "Nicht jetzt",
  className,
}: InstallPromptProps): React.ReactElement | null {
  // Das abgefangene Event aufheben, um später `prompt()` darauf aufzurufen.
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);
  const [sichtbar, setSichtbar] = useState(false);

  const titelId = useId();
  const beschreibungId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Bereits installiert oder zuvor abgelehnt → den Hinweis gar nicht erst aufbauen.
    if (isAppInstalled() || leseAbgelehnt()) return;

    function onBeforeInstall(e: Event) {
      // Das aufdringliche Default-Banner unterdrücken — wir bieten den Hinweis kontrolliert selbst an.
      e.preventDefault();
      promptEvent.current = e as BeforeInstallPromptEvent;
      setSichtbar(true);
    }

    // Wird die App während der Sitzung installiert, blenden wir uns sofort aus.
    function onInstalled() {
      promptEvent.current = null;
      setSichtbar(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Annahme: nativen Installations-Dialog auslösen, Ergebnis abwarten, danach ausblenden.
  const installieren = useCallback(async () => {
    const ev = promptEvent.current;
    if (!ev) {
      setSichtbar(false);
      return;
    }
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      // Bricht der native Dialog ab/wirft er, blenden wir uns einfach aus — kein erneutes Aufdrängen.
    } finally {
      // Ein `beforeinstallprompt`-Event ist genau einmal verwendbar.
      promptEvent.current = null;
      setSichtbar(false);
    }
  }, []);

  // Ablehnung: dauerhaft merken und ausblenden — der Hinweis kehrt nicht zurück.
  const ablehnen = useCallback(() => {
    speichereAbgelehnt();
    promptEvent.current = null;
    setSichtbar(false);
  }, []);

  if (!sichtbar) return null;

  return (
    <Card
      role="region"
      aria-labelledby={titelId}
      aria-describedby={beschreibungId}
      className={cn(
        "fv-surface-enter border border-border shadow-md",
        className,
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 id={titelId} className="text-sm font-semibold text-foreground">
            {titel}
          </h2>
          <p
            id={beschreibungId}
            className="mt-1 text-sm leading-relaxed text-muted-foreground"
          >
            {beschreibung}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={installieren} className="w-full sm:w-auto">
              <Download className="h-4 w-4" aria-hidden="true" />
              {installLabel}
            </Button>
            <Button
              variant="ghost"
              onClick={ablehnen}
              className="w-full sm:w-auto"
            >
              {ablehnenLabel}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={ablehnen}
          aria-label={`${ablehnenLabel} — ${titel} ausblenden`}
          className={cn(
            "-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground",
            "transition-colors ease-out hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </CardContent>
    </Card>
  );
}
