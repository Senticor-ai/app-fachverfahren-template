// VermerkAktionen — die Schreib-Naht des Aktenvermerks auf der Akte-Seite: ein Mensch-Vermerk-Formular
// UND ein „KI-Vermerk-Entwurf anfordern"-Knopf. Beide schreiben append-only in den Fall (der aufrufende
// Handler lädt danach neu → der Vermerk erscheint im Verlauf; KI-Entwürfe dort als prüfpflichtig markiert).
// Die KI erzeugt NUR einen Entwurf — die rechtsnahe Bewertung bleibt beim Menschen (HCAI).
import { useId, useState } from "react";
import { Button } from "@senticor/fachverfahren-kit";
import type { VermerkDto } from "@senticor/app-bff-contracts";

const feldClass =
  "w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const REVIEW_LABEL: Record<VermerkDto["reviewStatus"], string> = {
  "nicht-erforderlich": "",
  offen: "prüfpflichtig",
  bestaetigt: "bestätigt",
  verworfen: "verworfen",
};

/** Zell-Typen des Blackboards (für Mensch UND Agent dieselben, verständlichen Kategorien). */
const KIND_LABEL: Record<VermerkDto["kind"], string> = {
  hypothese: "Hypothese",
  teilergebnis: "Teilergebnis",
  frage: "Frage",
  befund: "Befund",
  entscheidung: "Entscheidung",
  notiz: "Notiz",
};
const KIND_OPTIONS: VermerkDto["kind"][] = [
  "notiz",
  "hypothese",
  "frage",
  "befund",
  "entscheidung",
];

export interface VermerkAktionenProps {
  /** Die vorhandenen Aktenvermerke (chronologisch, mit abgeleitetem Prüfstatus). */
  vermerke: VermerkDto[];
  /** Menschlichen Blackboard-Beitrag schreiben (Text + Zell-Typ). */
  onVermerk: (req: { text: string; kind: VermerkDto["kind"] }) => Promise<void>;
  /** KI-Aktenvermerk-Entwurf anfordern (task = worüber die KI vermerken soll). */
  onKiVermerk: (task: string) => Promise<void>;
  /** Einen KI-Vermerk-Entwurf prüfen (bestätigen/verwerfen). */
  onReview: (
    vermerkId: string,
    entscheidung: "bestaetigt" | "verworfen",
  ) => Promise<void>;
}

export function VermerkAktionen({
  vermerke,
  onVermerk,
  onKiVermerk,
  onReview,
}: VermerkAktionenProps): React.JSX.Element {
  const vermerkId = useId();
  const kindId = useId();
  const kiId = useId();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<VermerkDto["kind"]>("notiz");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sende-mensch" | "sende-ki" | "ki-fehler"
  >("idle");
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function pruefe(
    vId: string,
    entscheidung: "bestaetigt" | "verworfen",
  ): Promise<void> {
    setReviewingId(vId);
    try {
      await onReview(vId, entscheidung);
    } finally {
      setReviewingId(null);
    }
  }

  async function vermerkSpeichern(): Promise<void> {
    if (text.trim() === "") return;
    setStatus("sende-mensch");
    setHinweis(null);
    try {
      await onVermerk({ text: text.trim(), kind });
      setText("");
      setKind("notiz");
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

      {vermerke.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {vermerke.map((vm) => (
            <li
              key={vm.vermerkId}
              className="rounded-md border border-border p-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {KIND_LABEL[vm.kind]}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    vm.quelle === "ki"
                      ? "bg-muted text-muted-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {vm.quelle === "ki" ? "KI" : "Mensch"}
                </span>
                {/* Peer-Kennung: human:<rolle> ODER Modell/Agent — beide gleichrangig. */}
                <span className="text-xs text-muted-foreground">
                  {vm.urheber}
                </span>
                {vm.bezugVermerkId ? (
                  <span className="text-xs text-muted-foreground">↳ Antwort</span>
                ) : null}
                {REVIEW_LABEL[vm.reviewStatus] ? (
                  <span className="text-xs text-muted-foreground">
                    · {REVIEW_LABEL[vm.reviewStatus]}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {vm.text}
              </p>
              {vm.quelle === "ki" && vm.reviewStatus === "offen" ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void pruefe(vm.vermerkId, "bestaetigt")}
                    disabled={reviewingId === vm.vermerkId}
                  >
                    Bestätigen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void pruefe(vm.vermerkId, "verworfen")}
                    disabled={reviewingId === vm.vermerkId}
                  >
                    Verwerfen
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

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
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={kindId} className="text-xs text-muted-foreground">
          Art
        </label>
        <select
          id={kindId}
          value={kind}
          onChange={(e) => setKind(e.target.value as VermerkDto["kind"])}
          className="rounded-md border border-input bg-background p-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
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
