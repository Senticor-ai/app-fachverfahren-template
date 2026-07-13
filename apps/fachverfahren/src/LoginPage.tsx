// LoginPage — zeigt je nach `/auth/status` entweder das Einmal-Setup (Bootstrap, token-gated) oder
// den normalen Login. Kein Fachliches: nur die App-Komposition der Kit-Primitive.
import * as React from "react";
import { Navigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@senticor/fachverfahren-kit";
import { apiPath } from "./board-client.js";
import { useSession } from "./session.js";

export function LoginPage(): React.ReactElement {
  const { status, bootstrapped, apiAvailable, refresh } = useSession();
  // Nach erfolgreichem Login (oder bereits bestehender Session) zurück in den Workspace —
  // sonst bliebe der Benutzer trotz gültiger Session auf dem Login-Formular stehen.
  if (status === "authenticated") {
    return <Navigate to="/boards" replace />;
  }
  // Ist die API nicht erreichbar (Server down, Dev-Server ohne laufende Runtime), wäre jedes
  // Formular zwecklos — ehrlicher Hinweis mit Retry statt „Passwort falsch"-Irreführung.
  const title = apiAvailable
    ? bootstrapped
      ? "Anmelden"
      : "Workspace einrichten"
    : "Server nicht erreichbar";
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/20 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {!apiAvailable ? (
            <ApiUnavailableNotice onRetry={refresh} />
          ) : bootstrapped ? (
            <LoginForm onSuccess={refresh} />
          ) : (
            <BootstrapForm onSuccess={refresh} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiUnavailableNotice({
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

function LoginForm({
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

function BootstrapForm({
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
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">E-Mail</span>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Passwort (mind. 12 Zeichen)</span>
        <Input
          type="password"
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
