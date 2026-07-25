// testzugang-panel — der ausgewiesene Zugang zum Entwicklungsstand, sichtbar auf /hilfe.
//
// WARUM hier: solange es keine verifizierte Selbstregistrierung und keinen Identitätsnachweis
// (eID/BundID) gibt, ist der Bürgerpfad ohne Konto verschlossen. Statt die Authentisierung
// aufzuweichen, weist der Entwicklungsstand seine vorprovisionierten TESTKONTEN aus. Der Server
// entscheidet, ob es sie gibt (fail-closed, nie im Produktivbetrieb) — diese Fläche zeigt nur an.
//
// EHRLICHKEIT vor Bequemlichkeit: der Hinweis nennt ausdrücklich, dass es Testkonten sind. Gibt es
// keine, steht hier der GRUND (gesperrt) und keine leere Fläche, die wie ein Defekt aussieht.
import { useEffect, useState } from "react";
import {
  ladeTestzugang,
  type TestzugangAusweis,
} from "../testzugang-client.js";

export function TestzugangPanel(): React.JSX.Element | null {
  const [ausweis, setAusweis] = useState<TestzugangAusweis | null>(null);

  useEffect(() => {
    let lebendig = true;
    void ladeTestzugang().then((a) => {
      if (lebendig) setAusweis(a);
    });
    return () => {
      lebendig = false;
    };
  }, []);

  if (ausweis === null) return null;

  if (!ausweis.aktiv) {
    return (
      <section
        aria-labelledby="testzugang-titel"
        className="rounded-md border border-border bg-muted/40 px-4 py-3"
      >
        <h2 id="testzugang-titel" className="text-sm font-semibold">
          Testzugang gesperrt
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ausweis.erklaerung}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="testzugang-titel"
      className="rounded-md border border-border bg-secondary/40 px-4 py-3"
    >
      <h2 id="testzugang-titel" className="text-sm font-semibold">
        Testzugang zu diesem Entwicklungsstand
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{ausweis.hinweis}</p>
      {/* Der Tabellen-Rahmen scrollt waagerecht — also ist er fokussierbar (WCAG 2.1.1, wie die Codebloecke). */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Testkonten"
        className="mt-3 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Vorprovisionierte Testkonten mit Anmeldedaten, Zweck und Einstieg
          </caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">
                Konto
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Anmeldung
              </th>
              <th scope="col" className="py-1 font-medium">
                Wofür
              </th>
            </tr>
          </thead>
          <tbody>
            {ausweis.konten.map((k) => (
              <tr key={k.email} className="border-b border-border align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium text-foreground">{k.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Einstieg: {k.einstieg}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-mono text-xs break-all text-foreground">
                    {k.email}
                  </div>
                  <div className="font-mono text-xs break-all text-muted-foreground">
                    {k.passwort}
                  </div>
                </td>
                <td className="py-2 text-muted-foreground">{k.zweck}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
