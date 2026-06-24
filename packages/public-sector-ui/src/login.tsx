import { type ReactNode } from "react";
import { FormField } from "./forms.js";

// Föderierte-Identität-Pattern (BundID/eID): Das Fachverfahren betreibt KEIN eigenes Login, sondern
// vertraut die Authentifizierung dem föderierten Identitätsdienst an (BundID, eID/Personalausweis,
// ELSTER). Setzt arch:golden-eid-egov um: sichtbarer Vertrauensanker, klare Methodenwahl per Tablist,
// genau ein primärer Anmeldepfad, ready/loading/error explizit darstellbar, barrierearmer rechtlicher
// Footer. Reine, geprüfte Komponenten — der Motor komponiert daraus den Anmeldescreen.

/** Föderierte Anmeldemethode: eID (Personalausweis), ELSTER-Zertifikat oder Benutzername/Passwort. */
export type LoginMethod = "eid" | "elster" | "password";

/** ready = bereit zur Anmeldung; loading = Weiterleitung läuft; error = Anmeldung fehlgeschlagen. */
export type LoginState = "ready" | "loading" | "error";

interface MethodMeta {
  /** Kurzlabel im Reiter. */
  tab: string;
  /** Überschrift im Methodenpanel. */
  title: string;
  /** Erläuternder Klartext im Methodenpanel. */
  description: string;
}

/** Statische Beschreibungen der föderierten Methoden — bewusst auf Modulebene, keine Render-Logik. */
const METHOD_META: Record<LoginMethod, MethodMeta> = {
  eid: {
    tab: "eID",
    title: "Personalausweis mit Online-Funktion",
    description:
      "Melden Sie sich mit Ihrem Personalausweis und aktivierter Online-Ausweisfunktion an. " +
      "Halten Sie Ihren Ausweis und Ihre PIN bereit.",
  },
  elster: {
    tab: "ELSTER",
    title: "ELSTER-Zertifikat",
    description:
      "Melden Sie sich mit Ihrem ELSTER-Zertifikat an. Wählen Sie im nächsten Schritt Ihre " +
      "Zertifikatsdatei aus und geben Sie Ihr Passwort ein.",
  },
  password: {
    tab: "Benutzername + Passwort",
    title: "Benutzername und Passwort",
    description:
      "Melden Sie sich mit Ihren Zugangsdaten an. Verwenden Sie diese Methode nur, wenn Ihnen " +
      "weder eID noch ELSTER zur Verfügung stehen.",
  },
};

export interface BundIDLoginFormProps {
  /** Angebotene Methoden (Reihenfolge = Reiterreihenfolge). Standard: alle drei. */
  methods?: LoginMethod[];
  /** Aktuell gewählte Methode (kontrolliert). */
  activeMethod: LoginMethod;
  onMethodChange: (method: LoginMethod) => void;
  /** Startet die föderierte Anmeldung (Weiterleitung zum Identitätsdienst). */
  onLogin: () => void;
  state?: LoginState;
  /** Fehlertext, der bei state="error" in der Fehlerregion angezeigt wird. */
  errorMessage?: string;
  /** Name der anfragenden Behörde (für den Vertrauensanker). */
  authorityName: string;
}

/**
 * Föderiertes Anmeldeformular über BundID/eID. Bietet einen sichtbaren Vertrauensanker, eine
 * Methodenwahl per Tablist (eID / ELSTER / Benutzername+Passwort), genau einen primären
 * Anmeldepfad sowie eine ARIA-Fehlerregion und einen rechtlichen Footer.
 */
export function BundIDLoginForm({
  methods = ["eid", "elster", "password"],
  activeMethod,
  onMethodChange,
  onLogin,
  state = "ready",
  errorMessage,
  authorityName,
}: BundIDLoginFormProps) {
  const isLoading = state === "loading";
  const isError = state === "error";
  const panelId = `ps-login-panel-${activeMethod}`;
  const tabId = (method: LoginMethod) => `ps-login-tab-${method}`;

  return (
    <section
      className="ps-login"
      aria-labelledby="ps-login__heading"
      aria-busy={isLoading || undefined}
    >
      <div className="ps-login__trust" role="note">
        <span className="ps-login__trust-badge" aria-hidden="true">
          🛡
        </span>
        <span className="ps-login__trust-text">
          Sichere Anmeldung über BundID
        </span>
      </div>

      <h2 id="ps-login__heading" className="ps-login__heading">
        Anmeldung bei {authorityName}
      </h2>
      <p className="ps-muted">
        Bitte wählen Sie, wie Sie sich ausweisen möchten. Die Authentifizierung
        erfolgt über den föderierten Identitätsdienst — Ihre Zugangsdaten werden
        nicht an {authorityName} übermittelt.
      </p>

      <div
        className="ps-login__tablist"
        role="tablist"
        aria-label="Anmeldemethode"
      >
        {methods.map((method) => {
          const selected = method === activeMethod;
          return (
            <button
              key={method}
              type="button"
              id={tabId(method)}
              className={`ps-login__tab${selected ? " is-active" : ""}`}
              role="tab"
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onMethodChange(method)}
            >
              {METHOD_META[method].tab}
            </button>
          );
        })}
      </div>

      <div
        className="ps-login__panel"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(activeMethod)}
        tabIndex={0}
      >
        <h3 className="ps-login__panel-title">
          {METHOD_META[activeMethod].title}
        </h3>
        <p className="ps-muted">{METHOD_META[activeMethod].description}</p>
        {activeMethod === "password" ? renderCredentialFields() : null}
      </div>

      {isError ? (
        <div className="ps-login__error" role="alert">
          <span className="ps-login__error-badge" aria-hidden="true">
            ⚠
          </span>
          <span>
            {errorMessage ??
              "Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut."}
          </span>
        </div>
      ) : null}

      <div className="ps-login__actions">
        <button
          type="button"
          className="ps-btn ps-btn--primary ps-login__submit"
          disabled={isLoading}
          aria-disabled={isLoading || undefined}
          onClick={onLogin}
        >
          {isLoading ? "Anmeldung läuft …" : "Anmelden"}
        </button>
        {isLoading ? (
          <p className="ps-muted" role="status">
            Sie werden sicher zum Identitätsdienst weitergeleitet. Bitte
            schließen Sie das Fenster nicht.
          </p>
        ) : null}
      </div>

      <footer className="ps-login__legal">
        <nav aria-label="Rechtliche Hinweise" className="ps-login__legal-nav">
          <a className="ps-link" href="/barrierefreiheit">
            Barrierefreiheit
          </a>
          <a className="ps-link" href="/datenschutz">
            Datenschutz
          </a>
          <a className="ps-link" href="/impressum">
            Impressum
          </a>
        </nav>
      </footer>
    </section>
  );
}

/** Render-Helfer für die Zugangsdaten-Methode (kein verschachtelter Komponententyp). */
function renderCredentialFields(): ReactNode {
  return (
    <div className="ps-login__credentials">
      <FormField
        id="ps-login-username"
        label="Benutzername"
        value=""
        onChange={() => undefined}
        required
        autoComplete="username"
        hint="Ihr von der Behörde vergebener Benutzername."
      />
      <FormField
        id="ps-login-password"
        label="Passwort"
        value=""
        onChange={() => undefined}
        required
        autoComplete="current-password"
      />
    </div>
  );
}
