// /amt/verfahren/:procedureId/:version/wiki — das VERFAHRENS-WIKI: generelles Wissen + Fähigkeiten EINES
// Fachverfahrens (verfahrens-scoped, behörden-scoped, append-only). Mensch UND KI-Agent hinterlassen hier
// Wissen; chos-code liest es für die Weiterverarbeitung. Erreichbar aus der Akte (die caseId trägt das
// Verfahren). Streng präsentierend über verfahren-wissen-client.
import { useCallback, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@senticor/fachverfahren-kit";
import type { VermerkKind, WissenViewDto } from "@senticor/app-bff-contracts";
import { Shell } from "../app/shell.js";
import {
  kiVerfahrenWissen,
  ladeVerfahrenWissen,
  schreibeVerfahrenWissen,
} from "../verfahren-wissen-client.js";

const feldClass =
  "w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const KIND_LABEL: Record<string, string> = {
  wissen: "Wissen",
  faehigkeit: "Fähigkeit",
  hypothese: "Hypothese",
  frage: "Frage",
  befund: "Befund",
  reflexion: "Reflexion",
  notiz: "Notiz",
};
const KIND_OPTIONS: VermerkKind[] = [
  "wissen",
  "faehigkeit",
  "hypothese",
  "frage",
  "befund",
  "reflexion",
  "notiz",
];

export function AmtVerfahrenWikiPage(): React.JSX.Element {
  const { procedureId = "", version = "" } = useParams();
  const kindId = useId();
  const [eintraege, setEintraege] = useState<WissenViewDto[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<VermerkKind>("wissen");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<"laedt" | "idle" | "sende" | "fehler">(
    "laedt",
  );

  const neuLaden = useCallback(async () => {
    setEintraege(await ladeVerfahrenWissen(procedureId, version));
  }, [procedureId, version]);

  useEffect(() => {
    let ab = false;
    ladeVerfahrenWissen(procedureId, version)
      .then((e) => {
        if (!ab) setEintraege(e);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ab) setStatus("idle");
      });
    return () => {
      ab = true;
    };
  }, [procedureId, version]);

  async function schreiben(): Promise<void> {
    if (text.trim() === "") return;
    setStatus("sende");
    try {
      await schreibeVerfahrenWissen(procedureId, version, {
        text: text.trim(),
        kind,
      });
      setText("");
      await neuLaden();
      setStatus("idle");
    } catch {
      setStatus("fehler");
    }
  }

  async function kiAnfordern(): Promise<void> {
    if (task.trim() === "") return;
    setStatus("sende");
    try {
      await kiVerfahrenWissen(procedureId, version, { task: task.trim() });
      setTask("");
      await neuLaden();
      setStatus("idle");
    } catch {
      setStatus("fehler");
    }
  }

  return (
    <Shell persona="sachbearbeitung" activeNavKey="akten">
      <section className="mx-auto w-full max-w-4xl px-6 py-6">
        <Link
          to="/amt/akten"
          className="text-sm text-primary hover:underline"
        >
          ← Zu den Akten
        </Link>
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          Verfahrens-Wiki
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generelles Wissen + Fähigkeiten des Verfahrens{" "}
          <span className="font-medium text-foreground">{procedureId}</span> (v
          {version}). Einträge sind unveränderlich (append-only) — Mensch und
          KI-Agent tragen bei.
        </p>

        {eintraege.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {eintraege.map((e) => (
              <li
                key={e.eintragId}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      e.quelle === "ki"
                        ? "bg-muted text-muted-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {e.quelle === "ki" ? "KI" : "Mensch"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.urheber}
                  </span>
                  {e.verdacht ? (
                    <span className="text-xs font-medium text-destructive">
                      ⚠ Injektionsverdacht
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {e.text}
                </p>
              </li>
            ))}
          </ul>
        ) : status !== "laedt" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Noch kein Wissen hinterlegt.
          </p>
        ) : null}

        <div className="mt-6 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Wissen hinzufügen
          </h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={20000}
            className={`mt-2 ${feldClass}`}
            placeholder="Was ist zum Verfahren festzuhalten (Norm-Auslegung, Arbeitshilfe, Fähigkeit)?"
          />
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={kindId} className="text-xs text-muted-foreground">
              Art
            </label>
            <select
              id={kindId}
              value={kind}
              onChange={(e) => setKind(e.target.value as VermerkKind)}
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
              onClick={() => void schreiben()}
              disabled={status === "sende" || text.trim() === ""}
            >
              Speichern
            </Button>
          </div>

          <label className="mt-4 block text-sm text-muted-foreground">
            KI-Wissen anfordern (worüber?)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className={feldClass}
              placeholder="z. B. Zusammenfassung der Rechtslage"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void kiAnfordern()}
              disabled={status === "sende" || task.trim() === ""}
            >
              KI
            </Button>
          </div>
          {status === "fehler" ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Aktion nicht möglich. Bitte erneut versuchen.
            </p>
          ) : null}
        </div>
      </section>
    </Shell>
  );
}
