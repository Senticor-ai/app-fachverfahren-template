// PasswordChangePage — Self-Service-Passwortwechsel (POST /auth/password). Kein Fachliches:
// App-Komposition der Kit-Primitive, Muster wie die Auth-Formulare (Zustände, role="alert").
import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@senticor/fachverfahren-kit";
import { apiPath } from "./board-client.js";

export function PasswordChangePage(): React.ReactElement {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch(apiPath("/auth/password"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (response.status === 403) {
        setError("Das aktuelle Passwort ist nicht korrekt.");
        return;
      }
      if (response.status === 423) {
        setError(
          "Konto vorübergehend gesperrt. Bitte später erneut versuchen.",
        );
        return;
      }
      if (!response.ok) {
        setError(
          "Passwort konnte nicht geändert werden. Das neue Passwort braucht mindestens 12 Zeichen.",
        );
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Aktuelles Passwort</span>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Neues Passwort (mindestens 12 Zeichen)
              </span>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
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
                Passwort geändert. Es gilt ab der nächsten Anmeldung überall.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              Passwort ändern
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
