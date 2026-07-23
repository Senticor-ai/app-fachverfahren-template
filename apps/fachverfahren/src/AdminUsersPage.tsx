// AdminUsersPage — Benutzerverwaltung für Admins (Permission users.manage): Konten anlegen,
// aktivieren/deaktivieren, ARBEITSBEREICHE pflegen (Personas = Sicht-Zugänge, KEINE
// Berechtigungen — die hängen an der Workspace-Rolle). Kein Fachliches: nur App-Komposition
// der Kit-Primitive gegen /api/v1/users. Muster (Zustände, role="alert") wie auth-forms.
import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  mergePersonas,
  type Persona,
} from "@senticor/fachverfahren-kit";
import { apiPath } from "./board-client.js";
import { useSession } from "./session.js";
import { store } from "./store.js";

type WorkspaceRole = "admin" | "member" | "citizen";

interface ManagedUser {
  actorId: string;
  email: string;
  displayName: string;
  workspaceRole: WorkspaceRole;
  status: "active" | "disabled";
  /** Wirksame Arbeitsbereiche (Server: effectivePersonas) — Anzeige. */
  personas: Persona[];
  /** Lokale Quelle (admin-gepflegt) — die Checkboxen bearbeiten GENAU diese. */
  localPersonas: Persona[];
  /** Externe Quelle (OIDC-Sync) — read-only. */
  oidcPersonas: Persona[];
  personaManagementMode: "local" | "oidc_authoritative" | "oidc_additive";
  /** If-Match-Anker: zwei Admins überschreiben sich nicht stillschweigend (409). */
  principalVersion: number;
  createdAt: string;
}

/** Die zuweisbaren Arbeitsbereiche AUS DEN DATEN (mergePersonas: Default-Personas + verfahrens-eigene) —
 *  so kann ein Admin auch verfahrens-eigene Personas (Beschaffung/HR) zuweisen, nicht nur die 3 kanonischen. */
const ARBEITSBEREICHE: ReadonlyArray<{ key: Persona; label: string }> =
  mergePersonas(store.config.personas).map((p) => ({
    key: p.key,
    label: p.label,
  }));

const ROLLEN_BADGE: Record<
  WorkspaceRole,
  { label: string; tone: "info" | "neu" }
> = {
  admin: { label: "Admin", tone: "info" },
  member: { label: "Mitglied", tone: "neu" },
  citizen: { label: "Bürger:in", tone: "neu" },
};

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
  const rolle = ROLLEN_BADGE[user.workspaceRole] ?? ROLLEN_BADGE.member;
  // B7: Lokale Pflege ist NUR bei OIDC-Autorität gesperrt — im additiven Modus bleiben
  // die lokalen Checkboxen aktiv (extern zugewiesene Bereiche liegen read-only daneben).
  const lokalGesperrt = user.personaManagementMode === "oidc_authoritative";

  async function patch(body: Record<string, unknown>): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        apiPath(`/api/v1/users/${encodeURIComponent(user.actorId)}`),
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            // Optimistische Nebenläufigkeit: veraltete Sicht → 409 statt stillem Überschreiben.
            "if-match": `"${user.principalVersion}"`,
          },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 409) {
        setError(
          "Das Konto wurde zwischenzeitlich geändert — die Liste wurde neu geladen.",
        );
        await onChanged();
        return;
      }
      if (!response.ok) {
        setError("Änderung fehlgeschlagen.");
        return;
      }
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  function toggleArbeitsbereich(key: Persona): void {
    const next = user.localPersonas.includes(key)
      ? user.localPersonas.filter((entry) => entry !== key)
      : [...user.localPersonas, key];
    void patch({ personas: next });
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <Badge tone={rolle.tone}>{rolle.label}</Badge>
          <Badge tone={user.status === "active" ? "ok" : "block"}>
            {user.status === "active" ? "Aktiv" : "Deaktiviert"}
          </Badge>
          {!isSelf && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => void patch({ status: nextStatus })}
            >
              {user.status === "active" ? "Deaktivieren" : "Aktivieren"}
            </Button>
          )}
        </div>
      </div>
      <fieldset
        className="flex flex-wrap items-center gap-x-4 gap-y-1"
        disabled={submitting || lokalGesperrt}
      >
        <legend className="sr-only">
          Arbeitsbereiche von {user.displayName}
        </legend>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Arbeitsbereiche
        </span>
        {ARBEITSBEREICHE.map((bereich) => (
          <label
            key={bereich.key}
            className="flex items-center gap-1.5 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={user.localPersonas.includes(bereich.key)}
              onChange={() => toggleArbeitsbereich(bereich.key)}
            />
            {bereich.label}
          </label>
        ))}
        {lokalGesperrt && (
          <span className="text-xs text-muted-foreground">
            Extern verwaltet (OIDC)
          </span>
        )}
      </fieldset>
      {user.oidcPersonas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Extern zugewiesen (OIDC):{" "}
          {ARBEITSBEREICHE.filter((bereich) =>
            user.oidcPersonas.includes(bereich.key),
          )
            .map((bereich) => bereich.label)
            .join(", ")}
        </p>
      )}
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
  // Arbeitsbereiche sind eine EXPLIZITE Entscheidung je Konto (Server: Pflichtfeld);
  // Vorauswahl Sachbearbeitung, leer ist gültig (z.B. reines Boards-Konto).
  const [personas, setPersonas] = React.useState<Persona[]>([
    "sachbearbeitung",
  ]);
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
        body: JSON.stringify({ email, displayName, initialPassword, personas }),
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
        "Konto angelegt. Teilen Sie das initiale Passwort auf sicherem Weg — die Person kann es nach der Anmeldung über „Passwort ändern“ ersetzen.",
      );
      setDisplayName("");
      setEmail("");
      setInitialPassword("");
      setPersonas(["sachbearbeitung"]);
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
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Arbeitsbereiche</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {ARBEITSBEREICHE.map((bereich) => (
                <label
                  key={bereich.key}
                  className="flex items-center gap-1.5 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={personas.includes(bereich.key)}
                    onChange={() =>
                      setPersonas((current) =>
                        current.includes(bereich.key)
                          ? current.filter((entry) => entry !== bereich.key)
                          : [...current, bereich.key],
                      )
                    }
                  />
                  {bereich.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sicht-Zugänge des Kontos — Berechtigungen hängen an der
              Workspace-Rolle, nicht an den Arbeitsbereichen.
            </p>
          </fieldset>
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
