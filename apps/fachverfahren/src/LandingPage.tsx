// LandingPage — die EINE unauthentifizierte Route ("/"). Alle Rollen melden sich HIER an:
// Branding aus der LeistungConfig, die Auth-Karte (Login / Registrieren / Einmal-Setup /
// API-Hinweis, Logik in landing-state.ts) und die Einstiege in die Bereiche. Angemeldet
// filtern sich die Bereiche auf die ZUGEWIESENEN Arbeitsbereiche (personas.ts) — ohne
// Arbeitsbereich und ohne Boards-Permission bleibt der Freischalt-Hinweis. Alle anderen
// Routen sind session-pflichtig und bouncen unangemeldet mit `state.from` hierher; nach
// dem Login geht es auf den ursprünglichen Deep-Link zurück (postLoginRedirect — nur bei
// Client-Navigation, der History-State überlebt keinen Full-Reload).
//
// DIE BEREICHE KOMMEN AUS DER CONFIG (`config.personas` → personaBereiche), NICHT aus einem
// hartkodierten Array: früher stand hier ein festes BEREICHE = [Bürger:in · Sachbearbeitung ·
// Aufsicht] mit „(Demo-Daten)"-Texten — der generische Start-Screen, der JEDES Verfahren gleich
// aussehen ließ, obwohl das Fachkonzept eigene Personas beschreibt. Jetzt rendert die Landing die
// Sichten DIESES Verfahrens aus derselben EINEN Wahrheit, aus der auch die Shell ihren
// PersonaSwitcher speist. Fehlt `config.personas`, greifen die generischen Kit-Defaults (fail-open).
import * as React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
} from "@senticor/fachverfahren-kit";
import {
  ApiUnavailableNotice,
  BootstrapForm,
  LoginForm,
  RegisterForm,
} from "./auth-forms.js";
import { landingView, postLoginRedirect } from "./landing-state.js";
import { personaBereiche, sichtbareBereiche } from "./personas.js";
import { useSession } from "./session.js";
import { store } from "./store.js";

export function LandingPage(): React.ReactElement | null {
  const session = useSession();
  const location = useLocation();
  const view = landingView(session);
  const [authMode, setAuthMode] = React.useState<"login" | "register">("login");

  // Kein Formular-Flackern, solange der Session-Zustand lädt.
  if (view === "loading") return null;

  if (view === "authenticated") {
    const from = postLoginRedirect(
      (location.state as { from?: unknown } | null)?.from,
    );
    if (from) return <Navigate to={from} replace />;
  }

  const registerOffen =
    view === "login" && session.registration === "open_unverified";
  const showRegister = registerOffen && authMode === "register";

  const authTitle =
    view === "api-unavailable"
      ? "Server nicht erreichbar"
      : view === "bootstrap"
        ? "Workspace einrichten"
        : view === "authenticated"
          ? "Angemeldet"
          : showRegister
            ? "Registrieren"
            : "Anmelden";

  // Die Bereiche AUS DER CONFIG ableiten (EINE Wahrheit mit dem PersonaSwitcher der Shell),
  // dann angemeldet auf die eigenen Arbeitsbereiche + Boards-Permission filtern; unangemeldet
  // sind alle Einstiege sichtbar (der Klick bounct durchs Session-Gate).
  const bereiche = sichtbareBereiche(
    personaBereiche(store.config),
    view === "authenticated",
    session.principal,
    session.capabilities,
  );

  return (
    <main className="min-h-screen bg-secondary/20 px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            {store.config.label}
          </h1>
          <p className="text-sm text-muted-foreground">
            {store.config.kommune}
          </p>
        </header>
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="font-semibold leading-none tracking-tight">
                {authTitle}
              </h2>
            </CardHeader>
            <CardContent>
              <AuthCardBody
                view={view}
                showRegister={showRegister}
                registerOffen={registerOffen}
                onAuthModeChange={setAuthMode}
              />
            </CardContent>
          </Card>
          <section aria-labelledby="bereiche-heading" className="space-y-3">
            <h2
              id="bereiche-heading"
              className="font-semibold leading-none tracking-tight"
            >
              Bereiche
            </h2>
            {bereiche.length > 0 ? (
              <ul className="space-y-3">
                {bereiche.map((bereich) => (
                  <li key={bereich.href}>
                    <Link
                      to={bereich.href}
                      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {bereich.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {bereich.beschreibung}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              // Null-Arbeitsbereiche-Zustand: gültig — Konto existiert, aber es wurde
              // (noch) kein Arbeitsbereich freigeschaltet bzw. wieder entzogen.
              <p
                role="status"
                className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
              >
                Für Ihr Konto ist noch kein Arbeitsbereich freigeschaltet. Bitte
                wenden Sie sich an Ihre Administration.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/** Der Inhalt der Auth-Karte je Sicht — angemeldet wird sie zur Konto-Karte; bei
 *  geöffneter Registrierung (open_unverified) gibt es den Umschalter zum Bürger-Signup. */
function AuthCardBody({
  view,
  showRegister,
  registerOffen,
  onAuthModeChange,
}: {
  view: "api-unavailable" | "bootstrap" | "login" | "authenticated";
  showRegister: boolean;
  registerOffen: boolean;
  onAuthModeChange: (mode: "login" | "register") => void;
}): React.ReactElement {
  const { principal, refresh, logout } = useSession();
  if (view === "api-unavailable") {
    return <ApiUnavailableNotice onRetry={refresh} />;
  }
  if (view === "bootstrap") {
    return <BootstrapForm onSuccess={refresh} />;
  }
  if (view === "login") {
    if (showRegister) {
      return <RegisterForm onBackToLogin={() => onAuthModeChange("login")} />;
    }
    return (
      <div className="space-y-4">
        <LoginForm onSuccess={refresh} />
        {registerOffen && (
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => onAuthModeChange("register")}
          >
            Neu hier? Als Bürger:in registrieren
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Angemeldet als{" "}
        <span className="font-medium text-foreground">{principal?.email}</span>
      </p>
      <div className="flex items-center gap-3">
        <Link
          to="/konto/passwort"
          className="inline-flex h-10 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Passwort ändern
        </Link>
        <Button type="button" variant="ghost" onClick={() => void logout()}>
          Abmelden
        </Button>
      </div>
    </div>
  );
}
