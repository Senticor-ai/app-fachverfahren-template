// components/BundIDLoginForm — der GENERISCHE Bürger-Login (Surface: Bürger).
//
// Anmeldung über BundID/OIDC. Diese Kit-Komponente ist die UI + ein DETERMINISTISCHER MOCK des
// OIDC-Authorization-Code-Flows (Redirect → Callback → Profil). In PROD wird der Mock 1:1 durch
// `react-oidc-context` ersetzt: der "Mit BundID anmelden"-Button startet dann `auth.signinRedirect()`,
// und das aufgelöste `user.profile` (sub/given_name/family_name) fließt in dieselbe `onLogin`-Form.
//
// CONFIG-GETRIEBEN / domänen-frei: keine Verfahrens-Literale. Mandant kommt aus `kommune` (Prop),
// Vorbefüllung des optionalen Demo-Logins aus `vorbefuellung`. KEINE echten Secrets/Endpunkte/Client-IDs
// im Code — der synthetische `sub` wird lokal erzeugt. Barrierefrei (BITV 2.0 / WCAG 2.2 AA).
import { useEffect, useId, useRef, useState } from "react";
import {
  BadgeCheck,
  Fingerprint,
  Info,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import { Separator } from "../ui/separator.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card.js";

/** Das aus dem OIDC-Login aufgelöste Bürger-Profil (Teilmenge der OIDC-Claims, snake_case → camelCase). */
export interface BundIDProfil {
  /** Stabiler, pseudonymer Subject-Identifier (OIDC `sub`) — fachlich der Bürger-Schlüssel. */
  sub: string;
  vorname?: string;
  nachname?: string;
}

export interface BundIDLoginFormProps {
  /** Wird mit dem aufgelösten Profil gerufen, sobald die Anmeldung erfolgreich war. */
  onLogin: (profil: BundIDProfil) => void;
  /** Mandant/Diensteanbieter (nur Anzeige) — z.B. die zuständige Stelle. */
  kommune?: string;
  /** Optionale Vorbefüllung des lokalen Demo-Logins (z.B. { vorname, nachname }). */
  vorbefuellung?: Record<string, string>;
}

/** Pseudonymen Subject-Identifier erzeugen — synthetisch, ohne echten Identity-Provider. */
function syntheticSub(seed: string): string {
  const basis = `${seed}|${Date.now()}|${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  // Positiver, stabil formatierter Pseudo-Claim — kein echter Personenbezug.
  return `bundid-mock-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

type Phase = "idle" | "redirect" | "callback";

/** Der Bürger-Login: seriöse "Anmeldung"-Karte mit BundID-Primäraktion und optionalem Demo-Login. */
export function BundIDLoginForm({
  onLogin,
  kommune,
  vorbefuellung,
}: BundIDLoginFormProps): React.ReactElement {
  const formId = useId();
  const vornameId = `${formId}-vorname`;
  const nachnameId = `${formId}-nachname`;
  const demoErrorId = `${formId}-demo-error`;
  const statusId = `${formId}-status`;

  const [phase, setPhase] = useState<Phase>("idle");
  const [demoOffen, setDemoOffen] = useState(false);
  const [vorname, setVorname] = useState(vorbefuellung?.vorname ?? "");
  const [nachname, setNachname] = useState(vorbefuellung?.nachname ?? "");
  const [demoFehler, setDemoFehler] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  // Timer-Handles defensiv aufräumen (kein State-Update nach Unmount).
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const handles = timers.current;
    return () => {
      for (const t of handles) clearTimeout(t);
    };
  }, []);

  // 2.4.3 Fokus-Reihenfolge: Beim Aufklappen des Demo-Formulars wird der auslösende Button aus dem DOM ersetzt —
  // der Fokus MUSS aktiv auf das erste Feld wandern; beim Abbrechen zurück auf den (wieder erscheinenden) Trigger.
  const demoTriggerRef = useRef<HTMLButtonElement>(null);
  const vornameRef = useRef<HTMLInputElement>(null);
  const demoWarOffen = useRef(false);
  useEffect(() => {
    if (demoOffen && !demoWarOffen.current) vornameRef.current?.focus();
    else if (!demoOffen && demoWarOffen.current) demoTriggerRef.current?.focus();
    demoWarOffen.current = demoOffen;
  }, [demoOffen]);

  const beschaeftigt = phase !== "idle";

  /** Simuliert den OIDC-Redirect → Callback und liefert am Ende ein synthetisches Profil an `onLogin`.
   *  In PROD ersetzt `react-oidc-context` diesen Ablauf (signinRedirect → onSigninCallback). */
  function starteBundIDLogin(profilTeil?: {
    vorname?: string;
    nachname?: string;
  }): void {
    if (beschaeftigt) return;
    setDemoFehler(null);
    setPhase("redirect");
    setStatusText("Sie werden zur BundID weitergeleitet …");

    const t1 = setTimeout(() => {
      setPhase("callback");
      setStatusText("Anmeldung wird bestätigt …");
    }, 700);

    const t2 = setTimeout(() => {
      const profil: BundIDProfil = {
        sub: syntheticSub(
          `${profilTeil?.vorname ?? ""}${profilTeil?.nachname ?? ""}`,
        ),
        ...(profilTeil?.vorname?.trim()
          ? { vorname: profilTeil.vorname.trim() }
          : {}),
        ...(profilTeil?.nachname?.trim()
          ? { nachname: profilTeil.nachname.trim() }
          : {}),
      };
      setStatusText("Anmeldung erfolgreich.");
      onLogin(profil);
      // Phase zurücksetzen, falls die Komponente eingebunden bleibt.
      setPhase("idle");
    }, 1400);

    timers.current.push(t1, t2);
  }

  function demoAbsenden(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (beschaeftigt) return;
    if (nachname.trim().length === 0) {
      setDemoFehler("Bitte geben Sie mindestens einen Namen ein.");
      return;
    }
    setDemoFehler(null);
    starteBundIDLogin({ vorname, nachname });
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <CardTitle className="text-xl">Anmeldung</CardTitle>
          </div>
          <CardDescription>
            Melden Sie sich sicher mit Ihrem BundID-Konto an
            {kommune ? <> bei {kommune}</> : null}. Ihre Identität wird über das
            BundID-Servicekonto bestätigt.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Primäre Aktion — BundID */}
          <div className="space-y-2">
            <Button
              type="button"
              size="lg"
              className="w-full motion-reduce:transition-none"
              onClick={() => starteBundIDLogin()}
              disabled={beschaeftigt}
              aria-describedby={statusId}
            >
              {beschaeftigt ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Fingerprint className="h-4 w-4" aria-hidden="true" />
              )}
              {phase === "redirect"
                ? "Weiterleitung zur BundID …"
                : phase === "callback"
                  ? "Anmeldung wird bestätigt …"
                  : "Mit BundID anmelden"}
            </Button>

            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                Anmeldung mit Online-Ausweis (eID), ELSTER oder Ihrem
                BundID-Servicekonto. Es werden nur die für den Vorgang
                erforderlichen Angaben übermittelt.
              </span>
            </p>
          </div>

          {/* Live-Region: Status des Anmeldevorgangs (für Screenreader) */}
          <p id={statusId} role="status" aria-live="polite" className="sr-only">
            {statusText}
          </p>

          {/* Optionaler lokaler Demo-Login */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                oder
              </span>
              <Separator className="flex-1" />
            </div>

            {!demoOffen ? (
              <Button
                ref={demoTriggerRef}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setDemoOffen(true)}
                disabled={beschaeftigt}
                aria-expanded={false}
                aria-controls={`${formId}-demo`}
              >
                Demo-Anmeldung (ohne BundID)
              </Button>
            ) : (
              <form
                id={`${formId}-demo`}
                onSubmit={demoAbsenden}
                noValidate
                aria-label="Demo-Anmeldung mit Namenseingabe"
                className="space-y-4 rounded-md border border-border bg-background p-4"
              >
                <p className="text-sm text-muted-foreground">
                  Nur zum Ausprobieren ohne BundID-Konto. Es wird ein
                  synthetisches Profil erzeugt — keine echte Identitätsprüfung.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label
                      htmlFor={vornameId}
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Vorname
                    </Label>
                    <Input
                      ref={vornameRef}
                      id={vornameId}
                      value={vorname}
                      onChange={(e) => setVorname(e.target.value)}
                      autoComplete="given-name"
                      className="mt-1"
                      disabled={beschaeftigt}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={nachnameId}
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Nachname
                    </Label>
                    <Input
                      id={nachnameId}
                      value={nachname}
                      onChange={(e) => {
                        setNachname(e.target.value);
                        if (demoFehler) setDemoFehler(null);
                      }}
                      autoComplete="family-name"
                      required
                      aria-required="true"
                      aria-invalid={demoFehler ? true : undefined}
                      aria-describedby={demoFehler ? demoErrorId : undefined}
                      className={cn(
                        "mt-1",
                        demoFehler &&
                          "border-status-block focus-visible:ring-status-block",
                      )}
                      disabled={beschaeftigt}
                    />
                  </div>
                </div>

                {demoFehler && (
                  <p
                    id={demoErrorId}
                    role="alert"
                    className="flex items-center gap-1.5 text-sm text-status-block"
                  >
                    {demoFehler}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDemoOffen(false);
                      setDemoFehler(null);
                    }}
                    disabled={beschaeftigt}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={beschaeftigt}>
                    {beschaeftigt ? (
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    Anmelden
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 max-w-sm text-center text-xs text-muted-foreground">
        Ihre Anmeldedaten werden ausschließlich zur Bearbeitung Ihres Anliegens
        verwendet
        {kommune ? <> ({kommune})</> : null}.
      </p>
    </section>
  );
}
