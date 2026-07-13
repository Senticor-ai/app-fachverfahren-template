// LandingPage — die EINE unauthentifizierte Route ("/"). Alle Rollen melden sich HIER an:
// Branding aus der LeistungConfig, die Auth-Karte (Login / Einmal-Setup / API-Hinweis, Logik
// in landing-state.ts) und die Einstiege in die Bereiche. Alle anderen Routen sind session-
// gepflichtig und bouncen unangemeldet mit `state.from` hierher; nach dem Login geht es auf
// den ursprünglichen Deep-Link zurück (postLoginRedirect — nur bei Client-Navigation, der
// History-State überlebt keinen Full-Reload).
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
} from "./auth-forms.js";
import { landingView, postLoginRedirect } from "./landing-state.js";
import { useSession } from "./session.js";
import { store } from "./store.js";

/** Die Bereichs-Einstiege: Persona-Sichten (Demo-Daten) + der Boards-Workspace (echte Daten).
 *  Immer sichtbar — unangemeldet führt jeder Klick über das Session-Gate zurück zur Anmeldung. */
const BEREICHE = [
  {
    href: "/buerger",
    label: "Bürger:in",
    beschreibung: "Antrag stellen und Eingangsbestätigung (Demo-Daten)",
  },
  {
    href: "/amt",
    label: "Sachbearbeitung",
    beschreibung: "Arbeitsvorrat und Vorgangsprüfung (Demo-Daten)",
  },
  {
    href: "/aufsicht",
    label: "Aufsicht",
    beschreibung: "Kennzahlen und Audit (Demo-Daten)",
  },
  {
    href: "/boards",
    label: "Boards",
    beschreibung: "Team-Arbeitsbereich mit echten Arbeitsdaten",
  },
] as const;

export function LandingPage(): React.ReactElement | null {
  const session = useSession();
  const location = useLocation();
  const view = landingView(session);

  // Kein Formular-Flackern, solange der Session-Zustand lädt.
  if (view === "loading") return null;

  if (view === "authenticated") {
    const from = postLoginRedirect(
      (location.state as { from?: unknown } | null)?.from,
    );
    if (from) return <Navigate to={from} replace />;
  }

  const authTitle =
    view === "api-unavailable"
      ? "Server nicht erreichbar"
      : view === "bootstrap"
        ? "Workspace einrichten"
        : view === "authenticated"
          ? "Angemeldet"
          : "Anmelden";

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
              <AuthCardBody view={view} />
            </CardContent>
          </Card>
          <section aria-labelledby="bereiche-heading" className="space-y-3">
            <h2
              id="bereiche-heading"
              className="font-semibold leading-none tracking-tight"
            >
              Bereiche
            </h2>
            <ul className="space-y-3">
              {BEREICHE.map((bereich) => (
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
          </section>
        </div>
      </div>
    </main>
  );
}

/** Der Inhalt der Auth-Karte je Sicht — angemeldet wird sie zur Konto-Karte. */
function AuthCardBody({
  view,
}: {
  view: "api-unavailable" | "bootstrap" | "login" | "authenticated";
}): React.ReactElement {
  const { principal, refresh, logout } = useSession();
  if (view === "api-unavailable") {
    return <ApiUnavailableNotice onRetry={refresh} />;
  }
  if (view === "bootstrap") {
    return <BootstrapForm onSuccess={refresh} />;
  }
  if (view === "login") {
    return <LoginForm onSuccess={refresh} />;
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
