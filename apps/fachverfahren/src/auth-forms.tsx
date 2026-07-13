// auth-forms — die Auth-Formulare der Landing-Page: Login, Einmal-Setup (Bootstrap, token-gated)
// und der ehrliche API-Hinweis. Kein Fachliches: nur App-Komposition der Kit-Primitive.
// Die autoComplete/name-Attribute sind der Passwort-Manager-Vertrag
// (tests/auth-forms-password-manager.guard.test.ts) — nicht entfernen.
import * as React from "react";
import { Button, Input } from "@senticor/fachverfahren-kit";
import { apiPath } from "./board-client.js";

export function ApiUnavailableNotice({
  onRetry,
}: {
  onRetry: () => Promise<void>;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm text-muted-foreground">
        Der API-Server antwortet zurzeit nicht. Bitte versuchen Sie es gleich
        erneut. In der lokalen Entwicklung: läuft die App-Runtime
        (Fastify-Server), auf die der Vite-Dev-Proxy zeigt?
      </p>
      <Button type="button" className="w-full" onClick={() => void onRetry()}>
        Erneut versuchen
      </Button>
    </div>
  );
}

export function LoginForm({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}): React.ReactElement {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(apiPath("/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(
          response.status === 423
            ? "Konto vorübergehend gesperrt. Bitte später erneut versuchen."
            : "E-Mail-Adresse oder Passwort ist falsch.",
        );
        return;
      }
      await onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <Input
          type="email"
          name="email"
          // Passwort-Manager (1Password & Co.) erkennen das Anmelde-Paar über
          // username/current-password — type="email" allein reicht ihnen nicht.
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Passwort</span>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        Anmelden
      </Button>
    </form>
  );
}

export function BootstrapForm({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}): React.ReactElement {
  const [token, setToken] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(apiPath("/auth/bootstrap"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, password, displayName }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Einrichtung fehlgeschlagen.");
        return;
      }
      await onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Erstes Setup: das vom Betreiber ausgegebene Einrichtungs-Token eingeben,
        um den ersten Administrationszugang anzulegen.
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Einrichtungs-Token</span>
        <Input
          name="token"
          // one-time-code: verhindert, dass Passwort-Manager das Betreiber-Token
          // als Zugangsdaten interpretieren und hier Passwörter einfüllen.
          autoComplete="one-time-code"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <Input
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Passwort (mind. 12 Zeichen)</span>
        <Input
          type="password"
          name="password"
          // new-password: Passwort-Manager bieten hier Generieren + Speichern an.
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={12}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        Workspace einrichten
      </Button>
    </form>
  );
}

/** Self-Signup (nur bei registration === "open_unverified" erreichbar): legt ein
 *  Bürger-Konto an. Die Antwort ist bewusst NEUTRAL (Anti-Enumeration, kein Auto-
 *  Login) — nach dem Erfolg geht es zurück zur Anmeldung. Caps spiegeln den Server. */
export function RegisterForm({
  onBackToLogin,
}: {
  onBackToLogin: () => void;
}): React.ReactElement {
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(apiPath("/auth/register"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, password }),
      });
      if (response.status === 429) {
        setError(
          "Zu viele Versuche von dieser Verbindung. Bitte später erneut versuchen.",
        );
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 403
            ? "Die Registrierung ist zurzeit deaktiviert."
            : "Registrierung nicht möglich. Bitte Eingaben prüfen.",
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setMessage(
        body.message ??
          "Falls die E-Mail-Adresse noch nicht registriert war, wurde Ihr Konto angelegt. Melden Sie sich jetzt an.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (message) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
        <Button type="button" className="w-full" onClick={onBackToLogin}>
          Zur Anmeldung
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Als Bürger:in registrieren: Sie erhalten Zugang zur Antragstellung.
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <Input
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          required
          autoFocus
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Passwort (mind. 12 Zeichen)</span>
        <Input
          type="password"
          name="password"
          // new-password: Passwort-Manager bieten hier Generieren + Speichern an.
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={12}
          maxLength={256}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        Registrieren
      </Button>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={onBackToLogin}
      >
        Zurück zur Anmeldung
      </button>
    </form>
  );
}
