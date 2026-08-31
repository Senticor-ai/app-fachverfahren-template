// /buerger/antrag/:id — Status-Detail eines eigenen Antrags: der Lebensweg des Vorgangs
// (StatusVerfolgung, config-getrieben) für die Bürger:in. Hydriert bei Bedarf (Deep-Link/Reload),
// sodass der Vorgang auch ohne vorherige Listen-Ansicht auffindbar ist.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusVerfolgung } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";
import { NachweisSektion } from "./nachweis-sektion.js";
import { grundVon, statusVon } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";

export function BuergerAntragPage(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const v = store.get(id);
  // ── A FAILED HYDRATION IS NOT "APPLICATION NOT FOUND" ─────────────────────────────────────────────────
  // `.catch(() => undefined)` used to drop the reason, after which the view fell into the very branch that an
  // unknown file number reaches. A citizen whose session expired or whose connection dropped read that their
  // application does not exist — with no hint and no way to try again. Same construction as four sibling
  // pages; the shared shape lives in `app/ladelage.ts`.
  const [laedt, setLaedt] = useState(!v && store.laden !== undefined);
  const [fehler, setFehler] = useState<{
    grund: string;
    status: number | null;
  } | null>(null);
  const [versuch, setVersuch] = useState(0);
  useEffect(() => {
    if (v || store.laden === undefined) return;
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);
    store
      .laden()
      .catch((e: unknown) => {
        if (!abgebrochen)
          setFehler({ grund: grundVon(e), status: statusVon(e) });
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
    // `v` GEHOERT in die Deps und ist harmlos: laeuft die Wirkung nach erfolgreicher Hydrierung erneut, kehrt
    // die Wache in der ersten Zeile sofort zurueck. Ein Deckel (`eslint-disable`) fuer eine Regel, die dieses
    // Repo gar nicht fuehrt, waere zweimal falsch gewesen — er haette nichts unterdrueckt und dabei behauptet,
    // hier stehe eine bewusste Ausnahme.
  }, [versuch, v]);

  return (
    <Shell persona="buerger" activeNavKey="antraege">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <Link
          to="/buerger/antraege"
          className="text-sm text-primary hover:underline"
        >
          ← Zurück zu „Meine Anträge"
        </Link>
        {v ? (
          <div className="mt-4">
            <StatusVerfolgung vorgang={v} config={store.config} />
            {/* „Bescheid ansehen" NUR in einem Zustand, den ein bescheid-erlassender Übergang erreicht
                — data-driven aus der Config (kein Zustands-Literal). */}
            {store.config.statusMachine.transitions.some(
              (t) => t.erlaesstBescheid && t.to === v.status,
            ) ? (
              <Link
                to={`/buerger/bescheid/${v.id}`}
                className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Bescheid ansehen
              </Link>
            ) : null}
            {/* Nachweise zum eigenen Antrag hoch-/herunterladen (die caseId existiert hier). */}
            <NachweisSektion antragId={v.id} />
          </div>
        ) : laedt ? (
          <p className="mt-6 text-sm text-muted-foreground" aria-busy="true">
            Ihr Antrag wird geladen …
          </p>
        ) : fehler ? (
          <FehlerFlaeche
            className="mt-6"
            titel="Ihr Antrag konnte gerade nicht geladen werden."
            klarstellung="Das heißt NICHT, dass es ihn nicht gibt — wir konnten es nur nicht feststellen."
            grund={fehler.grund}
            status={fehler.status}
            erneut={() => setVersuch((n) => n + 1)}
          />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Antrag nicht gefunden.
          </p>
        )}
      </div>
    </Shell>
  );
}
