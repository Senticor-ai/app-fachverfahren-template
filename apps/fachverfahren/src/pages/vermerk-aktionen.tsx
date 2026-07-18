// VermerkAktionen — die Schreib-Naht des Aktenvermerks auf der Akte-Seite: ein Mensch-Vermerk-Formular
// UND ein „KI-Vermerk-Entwurf anfordern"-Knopf. Beide schreiben append-only in den Fall (der aufrufende
// Handler lädt danach neu → der Vermerk erscheint im Verlauf; KI-Entwürfe dort als prüfpflichtig markiert).
// Die KI erzeugt NUR einen Entwurf — die rechtsnahe Bewertung bleibt beim Menschen (HCAI).
import { useId, useState } from "react";
import { Button } from "@senticor/fachverfahren-kit";

const feldClass =
  "w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface VermerkAktionenProps {
  /** Menschlichen Aktenvermerk schreiben. */
  onVermerk: (text: string) => Promise<void>;
  /** KI-Aktenvermerk-Entwurf anfordern (task = worüber die KI vermerken soll). */
  onKiVermerk: (task: string) => Promise<void>;
}

export function VermerkAktionen({
  onVermerk,
  onKiVermerk,
}: VermerkAktionenProps): React.JSX.Element {
  const vermerkId = useId();
  const kiId = useId();
  const [text, setText] = useState("");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sende-mensch" | "sende-ki" | "ki-fehler"
  >("idle");
  const [hinweis, setHinweis] = useState<string | null>(null);

  async function vermerkSpeichern(): Promise<void> {
    if (text.trim() === "") return;
    setStatus("sende-mensch");
    setHinweis(null);
    try {
      await onVermerk(text.trim());
      setText("");
      setHinweis("Aktenvermerk gespeichert.");
    } finally {
      setStatus("idle");
    }
  }

  async function kiAnfordern(): Promise<void> {
    if (task.trim() === "") return;
    setStatus("sende-ki");
    setHinweis(null);
    try {
      await onKiVermerk(task.trim());
      setTask("");
      setHinweis(
        "KI-Entwurf erstellt — im Verlauf als prüfpflichtig (offen) markiert.",
      );
      setStatus("idle");
    } catch {
      setStatus("ki-fehler");
    }
  }

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Aktenvermerk</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Vermerke sind unveränderlich (append-only). Eine Korrektur ist ein neuer
        Vermerk.
      </p>

      <label
        htmlFor={vermerkId}
        className="mt-3 block text-sm text-muted-foreground"
      >
        Vermerk (Mensch)
      </label>
      <textarea
        id={vermerkId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={20000}
        className={`mt-1 ${feldClass}`}
        placeholder="Was ist zur Akte festzuhalten?"
      />
      <div className="mt-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void vermerkSpeichern()}
          disabled={status === "sende-mensch" || text.trim() === ""}
        >
          Vermerk speichern
        </Button>
      </div>

      <label
        htmlFor={kiId}
        className="mt-4 block text-sm text-muted-foreground"
      >
        KI-Vermerk-Entwurf anfordern (worüber?)
      </label>
      <input
        id={kiId}
        type="text"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        className={`mt-1 ${feldClass}`}
        placeholder="z. B. Zusammenfassung des Sachstands"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void kiAnfordern()}
          disabled={status === "sende-ki" || task.trim() === ""}
        >
          KI-Vermerk-Entwurf anfordern
        </Button>
        {status === "ki-fehler" ? (
          <span className="text-sm text-destructive" role="alert">
            KI-Entwurf nicht möglich (kein Modell erreichbar).
          </span>
        ) : null}
      </div>

      {hinweis ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {hinweis}
        </p>
      ) : null}
    </div>
  );
}
