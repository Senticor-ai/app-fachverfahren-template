// /buerger/postfach — das eigene Postfach: Bescheide/Nachrichten der Behörde (owner-scoped, server-seitig
// aus der Sitzung). Die generische Postfach-Komponente des Kits rendert Master-Detail + Zustellnachweis;
// diese Seite lädt nur die Daten und bildet MailboxMessageDto → PostfachNachricht ab (im mailbox-client).
import { useCallback, useEffect, useState } from "react";
import { Postfach, type PostfachNachricht } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { ladePostfach } from "../mailbox-client.js";
import { useLadelage } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";

// ── "BITTE ERNEUT VERSUCHEN" — UND ES GAB NICHTS ZU DRUECKEN ────────────────────────────────────────────
// The error branch named a remedy the surface did not offer: no retry, no second path, only the sentence.
// The one way out was a browser reload, which a first-time user does not recognise as part of the
// application. This mailbox is the authority's proof of delivery, so a wordless dead end here is expensive.
// The load shape is the shared one (`app/ladelage.ts`); the reason travels instead of being reduced to a
// boolean, which is what made the previous message unable to say anything.
export function BuergerPostfachPage(): React.JSX.Element {
  const [nachrichten, setNachrichten] = useState<PostfachNachricht[]>([]);
  const laden = useCallback(() => ladePostfach(), []);
  const { lage, erneut } = useLadelage(laden);
  const laedt = lage.art === "laedt";

  useEffect(() => {
    if (lage.art === "geladen") setNachrichten(lage.wert);
  }, [lage]);

  return (
    <Shell persona="buerger" activeNavKey="postfach">
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        {laedt ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Ihr Postfach wird geladen …
          </p>
        ) : lage.art === "fehler" ? (
          <FehlerFlaeche
            titel="Ihr Postfach konnte gerade nicht geladen werden."
            klarstellung="Das heißt NICHT, dass keine Nachrichten vorliegen — wir konnten es nur nicht feststellen. Zustellnachweise bleiben davon unberührt."
            grund={lage.grund}
            status={lage.status}
            erneut={erneut}
          />
        ) : (
          <Postfach nachrichten={nachrichten} titel="Mein Postfach" />
        )}
      </div>
    </Shell>
  );
}
