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
  pruefeVerfahrenWissen,
  schreibeVerfahrenWissen,
} from "../verfahren-wissen-client.js";
import { useLadelage } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";

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

// Prüfstatus als TEXT (BITV: Farbe allein trägt keine Bedeutung); leere Labels = keine Anzeige.
const REVIEW_LABEL: Record<WissenViewDto["reviewStatus"], string> = {
  "nicht-erforderlich": "",
  offen: "prüfpflichtig",
  bestaetigt: "✓ bestätigt",
  verworfen: "verworfen",
};

export function AmtVerfahrenWikiPage(): React.JSX.Element {
  const { procedureId = "", version = "" } = useParams();
  const kindId = useId();
  const textId = useId();
  const taskId = useId();
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

  // ── A FAILED FETCH IS NOT "NO KNOWLEDGE RECORDED" ─────────────────────────────────────────────────────
  // The knowledge base is append-only procedure knowledge INCLUDING AI drafts that carry a review
  // obligation (`e.reviewStatus === "offen"`). When the fetch failed, this view told the caseworker there
  // was no knowledge — and the open drafts vanished from the review duty without a sound. Same construction
  // as four sibling pages; the shared shape lives in `app/ladelage.ts`.
  const ladeWissen = useCallback(
    () => ladeVerfahrenWissen(procedureId, version),
    [procedureId, version],
  );
  const { lage, erneut } = useLadelage(ladeWissen);
  useEffect(() => {
    if (lage.art === "geladen") setEintraege(lage.wert);
    if (lage.art !== "laedt") setStatus("idle");
  }, [lage]);

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

  async function pruefen(
    eintragId: string,
    entscheidung: "bestaetigt" | "verworfen",
  ): Promise<void> {
    setStatus("sende");
    try {
      await pruefeVerfahrenWissen(procedureId, version, eintragId, {
        entscheidung,
      });
      await neuLaden();
      setStatus("idle");
    } catch {
      setStatus("fehler");
    }
  }

  return (
    <Shell persona="sachbearbeitung" activeNavKey="akten">
      <section className="mx-auto w-full max-w-4xl px-6 py-6">
        <Link to="/amt/akten" className="text-sm text-primary hover:underline">
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
                  {REVIEW_LABEL[e.reviewStatus] ? (
                    <span className="text-xs text-muted-foreground">
                      · {REVIEW_LABEL[e.reviewStatus]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {e.text}
                </p>
                {e.reviewStatus === "offen" ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      KI-Entwurf prüfen:
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void pruefen(e.eintragId, "bestaetigt")}
                      disabled={status === "sende"}
                    >
                      Bestätigen
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void pruefen(e.eintragId, "verworfen")}
                      disabled={status === "sende"}
                    >
                      Verwerfen
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : lage.art === "fehler" ? (
          <FehlerFlaeche
            className="mt-4"
            titel="Das Verfahrenswissen konnte gerade nicht geladen werden."
            klarstellung="Das heißt NICHT, dass keines hinterlegt ist — wir konnten es nur nicht feststellen. Offene KI-Entwürfe bleiben prüfpflichtig, auch wenn sie hier gerade nicht erscheinen."
            grund={lage.grund}
            status={lage.status}
            erneut={erneut}
          />
        ) : status !== "laedt" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Noch kein Wissen hinterlegt.
          </p>
        ) : null}

        <div className="mt-6 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Wissen hinzufügen
          </h2>
          {/* The heading stood only OPTICALLY above this field: no label, no aria-label, no aria-labelledby.
              The placeholder was the sole carrier of the name — and it disappears with the first keystroke,
              which is exactly what WCAG 2.2 / BITV 4.1.2 forbids. The label is now programmatic. */}
          <label
            htmlFor={textId}
            className="mt-2 block text-xs text-muted-foreground"
          >
            Was ist zum Verfahren festzuhalten (Norm-Auslegung, Arbeitshilfe,
            Fähigkeit)?
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={20000}
            className={`mt-1 ${feldClass}`}
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

          {/* The label carried no `htmlFor` and did not wrap the field (the input sits in the following
              sibling div), so the association existed neither implicitly nor explicitly: a screen reader
              announced a nameless text box next to a button called only "KI". */}
          <label
            htmlFor={taskId}
            className="mt-4 block text-sm text-muted-foreground"
          >
            KI-Wissen anfordern (worüber?)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={taskId}
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
