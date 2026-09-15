// /buerger/bescheid/:id — der eigene, EINGEFRORENE Bescheid. Lädt den bestandskräftigen VA
// server-seitig (GET .../bescheid, owner-scoped, als case.disclosed auditiert = Bekanntgabe) und
// rendert ihn über BescheidView. Der Tenor und die Rechtsbehelfsbelehrung kommen AUSSCHLIESSLICH aus
// dem gefrorenen Snapshot (nicht aus der lebenden Config) — so ändert eine spätere Tarif-/Regime-
// Umstellung den bereits erlassenen Bescheid NICHT.
import { useCallback, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BescheidView,
  Button,
  type Vorgang,
} from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useLadelage } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";
import { store } from "../store.js";
import { CaseRequestError } from "../case-client.js";
import {
  bescheidPdfUrl,
  ladeBescheid,
  legeWiderspruchEin,
  type VerwaltungsaktDto,
} from "../antrag-client.js";

/** Regime-neutrale Beschriftung des Rechtsbehelfs (aus dem eingefrorenen Regime des Bescheids). */
const RECHTSBEHELF_LABEL: Record<
  "widerspruch" | "einspruch" | "klage",
  { name: string; verb: string }
> = {
  widerspruch: { name: "Widerspruch", verb: "Widerspruch einlegen" },
  einspruch: { name: "Einspruch", verb: "Einspruch einlegen" },
  klage: { name: "Klage", verb: "Klage erheben" },
};

/**
 * Die Rechtsbehelfs-HANDLUNG zur Belehrung: den Widerspruch/Einspruch/die Klage gegen den eigenen
 * Bescheid einlegen. Die Begründung ist optional (fristwahrend darf zunächst unbegründet). Der Server
 * lässt den Rechtsbehelf nur EINMAL zu (409) — die UI zeigt das ehrlich an.
 */
function WiderspruchAktion({
  antragId,
  art,
}: {
  antragId: string;
  art: "widerspruch" | "einspruch" | "klage";
}): React.JSX.Element {
  const label = RECHTSBEHELF_LABEL[art];
  const feldId = useId();
  const [begruendung, setBegruendung] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sende" | "erledigt" | "bereits" | "fehler"
  >("idle");
  const [eingelegtAm, setEingelegtAm] = useState<string | null>(null);

  async function einlegen(): Promise<void> {
    setStatus("sende");
    try {
      const dto = await legeWiderspruchEin(
        antragId,
        begruendung.trim() === "" ? undefined : begruendung.trim(),
      );
      setEingelegtAm(dto.eingelegtAm);
      setStatus("erledigt");
    } catch (fehler) {
      setStatus(
        fehler instanceof CaseRequestError && fehler.status === 409
          ? "bereits"
          : "fehler",
      );
    }
  }

  if (status === "erledigt" || status === "bereits") {
    return (
      <div
        className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm"
        role="status"
      >
        <p className="font-medium text-foreground">{label.name} eingelegt.</p>
        <p className="mt-1 text-muted-foreground">
          {status === "bereits"
            ? `Für diesen Bescheid wurde bereits ein ${label.name} eingelegt.`
            : `Ihr ${label.name} ist am ${eingelegtAm ? new Date(eingelegtAm).toLocaleString("de-DE") : ""} eingegangen (Fristwahrung).`}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">
        Mit dem Bescheid nicht einverstanden?
      </h2>
      <label
        htmlFor={feldId}
        className="mt-2 block text-sm text-muted-foreground"
      >
        Begründung (optional)
      </label>
      <textarea
        id={feldId}
        value={begruendung}
        onChange={(e) => setBegruendung(e.target.value)}
        rows={3}
        maxLength={5000}
        className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Warum sind Sie nicht einverstanden? (kann später nachgereicht werden)"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void einlegen()}
          disabled={status === "sende"}
        >
          {label.verb}
        </Button>
        {status === "fehler" ? (
          <span className="text-sm text-destructive" role="alert">
            {label.name} konnte nicht eingelegt werden. Bitte erneut versuchen.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Der gefrorene VA → ein Vorgang-Objekt, das BescheidView rendert (Tenor = eingefrorene Berechnung). */
function toVorgang(va: VerwaltungsaktDto): Vorgang {
  const basis: Vorgang = {
    id: va.aktenzeichen,
    vorgangsnummer: va.aktenzeichen,
    eingangIso: va.issuedAt,
    antragsdaten: {},
    status: "festgesetzt",
    nachweise: [],
    history: [],
  };
  // Tenor ist die eingefrorene Berechnung (opak transportiert) — nur setzen, wenn vorhanden
  // (exactOptionalPropertyTypes: kein explizites undefined).
  if (va.tenor)
    basis.berechnung = va.tenor as unknown as NonNullable<
      Vorgang["berechnung"]
    >;
  return basis;
}

// ── A FAILED LOAD IS NOT "THERE IS NO NOTICE" ──────────────────────────────────────────────────────────────
// `ladeBescheid` deliberately separates the two cases: 404 => `null` ("no notice issued yet"), EVERY other
// failure => throw. This page used to discard that with `.catch(() => undefined)`, so a network drop, a 500, a
// 403 or an expired session all landed in the 404 branch and the citizen read "Für diesen Antrag liegt noch
// kein Bescheid vor."
//
// That is not a missing error message, it is a FALSE STATEMENT OF FACT — and it stands on the one page where
// the appeal period hangs: fetching one's own notice IS the disclosure (`case.disclosed`) the server anchors
// the deadline on. A citizen who reads "there is no notice" does not file an appeal.
//
// Measured 2026-08-31 in two independently built procedures, identically in both — and in four sibling pages.
// The shared shape lives in `app/ladelage.ts`; a private copy here would be the second truth.
export function BuergerBescheidPage(): React.JSX.Element {
  const { id = "" } = useParams();
  const laden = useCallback(() => ladeBescheid(id), [id]);
  const { lage, erneut } = useLadelage(laden);
  const va = lage.art === "geladen" ? lage.wert : null;
  const laedt = lage.art === "laedt";

  return (
    <Shell persona="buerger" activeNavKey="antraege">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <Link
          to={`/buerger/antrag/${id}`}
          className="text-sm text-primary hover:underline"
        >
          ← Zurück zum Antrag
        </Link>
        {laedt ? (
          <p className="mt-6 text-sm text-muted-foreground" aria-busy="true">
            Ihr Bescheid wird geladen …
          </p>
        ) : va ? (
          <div className="mt-4">
            <BescheidView
              vorgang={toVorgang(va)}
              config={store.config}
              // Die EINGEFRORENE Belehrung — regime-neutral, aus dem Snapshot, NICHT aus der Config.
              belehrung={{
                rechtsbehelf: va.rechtsbehelf,
                fiktionTage: va.fiktionTage,
                fiktionNorm: va.fiktionNorm,
              }}
              // PFLICHTANGABEN DES VA (Phase 5, W5) — dieselben Slots wie im PDF, aus DEMSELBEN eingefrorenen
              // Verwaltungsakt. Beide Flächen zeigen damit denselben Bescheid; vorher fehlten Inhaltsadressat,
              // Erhebungszeitraum, Leistungsgebot und Unterschrift/Automations-Vermerk auf BEIDEN.
              pflichtangaben={{
                ...(va.adressat ? { adressat: va.adressat } : {}),
                ...(va.behoerde ? { behoerde: va.behoerde } : {}),
                ...(va.zeitraum ? { zeitraum: va.zeitraum } : {}),
                ...(va.leistungsgebot
                  ? { leistungsgebot: va.leistungsgebot }
                  : {}),
                ...(va.unterschrift ? { unterschrift: va.unterschrift } : {}),
                ...(va.entwurf ? { entwurf: true } : {}),
              }}
              // Echter, server-generierter Bescheid als Datei-Download (owner-scoped, hash-beweisbar).
              pdfDownloadUrl={bescheidPdfUrl(id)}
            />
            {/* Die HANDLUNG zur Belehrung: den Rechtsbehelf tatsächlich einlegen (Art aus dem Regime). */}
            <WiderspruchAktion antragId={id} art={va.rechtsbehelf.art} />
          </div>
        ) : lage.art === "fehler" ? (
          <FehlerFlaeche
            className="mt-6"
            titel="Ihr Bescheid konnte gerade nicht geladen werden."
            klarstellung="Das heißt NICHT, dass kein Bescheid vorliegt — wir konnten es nur nicht feststellen. Eine laufende Rechtsbehelfsfrist läuft weiter. Bitte versuchen Sie es erneut; bleibt es dabei, wenden Sie sich an die im Bescheid genannte Stelle."
            grund={lage.grund}
            status={lage.status}
            erneut={erneut}
          />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Für diesen Antrag liegt noch kein Bescheid vor.
          </p>
        )}
      </div>
    </Shell>
  );
}
