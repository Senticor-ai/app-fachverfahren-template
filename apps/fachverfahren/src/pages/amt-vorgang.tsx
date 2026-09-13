// /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) für EINEN Vorgang.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ComposableSummaryDto } from "@senticor/app-bff-contracts";
import { ReviewWorkspace } from "@senticor/fachverfahren-kit";
import { ARCHETYPEN } from "@senticor/public-sector-sdk";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { amtStore } from "../store.js";
import { grundVon, statusVon, useLadelage } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";
import {
  CASE_REVIEW_TASK,
  createCaseReviewer,
  ladeComposables,
  loadComposableDetail,
} from "../composable-chat-client.js";

/**
 * THE REVIEWER BEHIND THIS MASK (Z3) — which composable checks a case here, or `null` when none may.
 *
 * WHICH: the processing surface — `ARCHETYPEN.bearbeitung.id`, the id the server mounts it under and keys its
 * archetype on (composables-mounted.ts, `archetypVonId`), carrying a spine. The same discovery the assistant page
 * reads; there is no second key for "the surface" (an emitted manifest's `flaeche` equals this id by construction).
 *
 * DARK (`null`), each a verified absence: not mounted · no spine · the spine does not declare the review task (read
 * from the detail the spine route checks, so the mask never offers a request that would be refused for it) · the
 * session may not run spines (403) · the composable is gone (404).
 *
 * NOT DARK: every other failure REJECTS. A lookup that could not be made is not the statement "there is no
 * reviewer" — the page names it.
 */
export async function findCaseReviewer(): Promise<ComposableSummaryDto | null> {
  try {
    const composables = await ladeComposables();
    const reviewer = composables.find(
      (c) => c.id === ARCHETYPEN.bearbeitung.id && c.hasSpine,
    );
    if (!reviewer) return null;
    const detail = await loadComposableDetail(reviewer.id);
    return detail.spine?.aufgaben.includes(CASE_REVIEW_TASK) ? reviewer : null;
  } catch (error) {
    const status = statusVon(error);
    if (status === 403 || status === 404) return null;
    throw error;
  }
}

export function AmtVorgangPage(): React.JSX.Element {
  useStoreVersion(amtStore);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  // Direkter Einstieg (Lesezeichen/Reload): der Bestand kommt vom SERVER, nicht aus dem Browser.
  const [laedt, setLaedt] = useState(!amtStore.get(id));
  const [fehler, setFehler] = useState<{
    grund: string;
    status: number | null;
  } | null>(null);
  const [versuch, setVersuch] = useState(0);
  useEffect(() => {
    if (amtStore.get(id)) return;
    let abgebrochen = false;
    setFehler(null);
    void amtStore
      .laden?.()
      .catch((e: unknown) => {
        // A failed hydration used to fall through into ReviewWorkspace with an unhydrated store — the
        // caseworker saw an empty workspace instead of a named situation. See app/ladelage.ts.
        if (!abgebrochen)
          setFehler({ grund: grundVon(e), status: statusVon(e) });
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [id, versuch]);

  // The reviewer belongs to the application, not to one case: looked up once per page, beside the case load.
  const { lage: reviewerLookup, erneut: retryReviewerLookup } =
    useLadelage(findCaseReviewer);
  const reviewer = useMemo(
    () =>
      reviewerLookup.art === "geladen" && reviewerLookup.wert
        ? createCaseReviewer(reviewerLookup.wert, id)
        : undefined,
    [reviewerLookup, id],
  );

  if (laedt)
    return (
      <Shell persona="sachbearbeitung" activeNavKey="eingang">
        <p
          className="p-4 text-sm text-muted-foreground md:p-8"
          aria-busy="true"
        >
          Der Vorgang wird geladen …
        </p>
      </Shell>
    );

  if (fehler)
    return (
      <Shell persona="sachbearbeitung" activeNavKey="eingang">
        <FehlerFlaeche
          className="p-4 md:p-8"
          titel="Der Vorgang konnte gerade nicht geladen werden."
          klarstellung="Das heißt NICHT, dass es ihn nicht gibt — wir konnten es nur nicht feststellen."
          grund={fehler.grund}
          status={fehler.status}
          erneut={() => setVersuch((n) => n + 1)}
        />
      </Shell>
    );

  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      {reviewerLookup.art === "fehler" ? (
        <FehlerFlaeche
          className="px-4 pt-4 md:px-8"
          titel="Die prüfende Stelle konnte gerade nicht ermittelt werden."
          klarstellung="Das heißt NICHT, dass es keine gibt — wir konnten es nur nicht feststellen. Der Vorgang selbst ist davon nicht berührt."
          grund={reviewerLookup.grund}
          status={reviewerLookup.status}
          erneut={retryReviewerLookup}
        />
      ) : null}
      <ReviewWorkspace
        config={amtStore.config}
        port={amtStore}
        vorgangId={id}
        rolle="sachbearbeitung"
        {...(reviewer ? { reviewer } : {})}
        // AKTEUR (Person, nicht Rolle): in PROD die angemeldete BundID-Identität. Im DEV-Demo (keine Anmeldung)
        // eine stabile pseudonyme Person, damit die Vier-Augen-Prüfung greift und die History WER-nachweisbar wird
        // (history[].akteur) — der Store erzwingt dann „andere Person als der letzte Akteur" bei vierAugen-Übergängen.
        akteur="sb.angemeldet"
        onClose={() => navigate("/amt")}
      />
    </Shell>
  );
}
