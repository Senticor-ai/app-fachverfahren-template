// /buerger/postfach — das eigene Postfach: Bescheide/Nachrichten der Behörde (owner-scoped, server-seitig
// aus der Sitzung). Die generische Postfach-Komponente des Kits rendert Master-Detail + Zustellnachweis;
// diese Seite lädt nur die Daten und bildet MailboxMessageDto → PostfachNachricht ab (im mailbox-client).
import { useEffect, useState } from "react";
import { Postfach, type PostfachNachricht } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { ladePostfach } from "../mailbox-client.js";

export function BuergerPostfachPage(): React.JSX.Element {
  const [nachrichten, setNachrichten] = useState<PostfachNachricht[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    ladePostfach()
      .then((n) => {
        if (!abgebrochen) setNachrichten(n);
      })
      .catch(() => {
        if (!abgebrochen) setFehler(true);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  return (
    <Shell persona="buerger" activeNavKey="postfach">
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        {laedt ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Ihr Postfach wird geladen …
          </p>
        ) : fehler ? (
          <p className="text-sm text-destructive" role="alert">
            Das Postfach konnte nicht geladen werden. Bitte erneut versuchen.
          </p>
        ) : (
          <Postfach nachrichten={nachrichten} titel="Mein Postfach" />
        )}
      </div>
    </Shell>
  );
}
