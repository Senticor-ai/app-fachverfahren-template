// AdminUsersPage — Benutzerverwaltung für Admins (Permission users.manage): Konten anlegen,
// aktivieren/deaktivieren. Kein Fachliches: nur App-Komposition der Kit-Primitive gegen
// /api/v1/users. Muster (Zustände, role="alert", Copy) wie LoginPage/BoardList.
import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@senticor/fachverfahren-kit";
import { apiPath } from "./board-client.js";
import { useSession } from "./session.js";

interface ManagedUser {
  actorId: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  status: "active" | "disabled";
  createdAt: string;
}

export function AdminUsersPage(): React.ReactElement {
  const { principal } = useSession();
  const [users, setUsers] = React.useState<ManagedUser[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(apiPath("/api/v1/users"), {
        credentials: "include",
      });
      if (!response.ok) {
        setLoadError("Benutzer konnten nicht geladen werden.");
        return;
      }
      setUsers((await response.json()) as ManagedUser[]);
    } catch {
      setLoadError("Benutzer konnten nicht geladen werden.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Benutzerverwaltung</h1>

      <CreateUserCard onCreated={load} />

      <Card>
        <CardHeader>
          <CardTitle>Konten</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {loadError}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
              >
                Erneut versuchen
              </Button>
            </div>
          )}
          {!loadError && users === null && (
            <p className="text-sm text-muted-foreground">Lade Benutzer …</p>
          )}
          {!loadError && users !== null && (
            <ul className="divide-y divide-border">
              {users.map((user) => (
                <UserRow
                  key={user.actorId}
                  user={user}
                  isSelf={user.actorId === principal?.actorId}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: ManagedUser;
  isSelf: boolean;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const nextStatus = user.status === "active" ? "disabled" : "active";

  async function toggleStatus() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        apiPath(`/api/v1/users/${encodeURIComponent(user.actorId)}`),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!response.ok) {
        setError("Statusänderung fehlgeschlagen.");
        return;
      }
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {user.displayName}
          {isSelf && (
            <span className="text-muted-foreground"> (Ihr Konto)</span>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={user.role === "admin" ? "info" : "neu"}>
          {user.role === "admin" ? "Admin" : "Mitglied"}
        </Badge>
        <Badge tone={user.status === "active" ? "ok" : "block"}>
          {user.status === "active" ? "Aktiv" : "Deaktiviert"}
        </Badge>
        {!isSelf && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => void toggleStatus()}
          >
            {user.status === "active" ? "Deaktivieren" : "Aktivieren"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function CreateUserCard({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}): React.ReactElement {
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [initialPassword, setInitialPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(apiPath("/api/v1/users"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, initialPassword }),
      });
      if (response.status === 409) {
        setError("Ein Konto mit dieser E-Mail-Adresse existiert bereits.");
        return;
      }
      if (!response.ok) {
        setError(
          "Konto konnte nicht angelegt werden. Bitte Eingaben prüfen (Passwort: mindestens 12 Zeichen).",
        );
        return;
      }
      setSuccess(
        "Konto angelegt. Teilen Sie das initiale Passwort auf sicherem Weg — die Person kann es unter /auth/password ändern.",
      );
      setDisplayName("");
      setEmail("");
      setInitialPassword("");
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Neues Benutzerkonto</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <span className="text-sm font-medium">
              Initiales Passwort (mindestens 12 Zeichen)
            </span>
            <Input
              type="password"
              value={initialPassword}
              onChange={(event) => setInitialPassword(event.target.value)}
              minLength={12}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-muted-foreground">
              {success}
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            Konto anlegen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
