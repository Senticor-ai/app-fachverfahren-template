import { Link } from "react-router-dom";
import {
  Banner,
  Barrierefreiheitserklaerung,
} from "@senticor/fachverfahren-kit";
import { barrierefreiheitConfig } from "./barrierefreiheit.config.js";
import { store } from "./store.js";

export function BarrierefreiheitPage(): React.ReactElement {
  const {
    provisional,
    stand,
    nichtKonformeInhalte,
    feedbackEmail,
    schlichtungsstelle,
  } = barrierefreiheitConfig;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-6">
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="text-2xl font-semibold">{store.config.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {store.config.kommune}
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 py-8" id="main-content">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          {provisional && (
            <Banner variant="warn" title="Vorläufige Mustererklärung">
              Diese Angaben sind noch nicht als Konformitätsaussage freigegeben
              und müssen vor dem produktiven Einsatz geprüft und ersetzt werden.
            </Banner>
          )}
          <Barrierefreiheitserklaerung
            stand={stand}
            feedbackEmail={feedbackEmail}
            feedbackBetreff={`Barriere melden: ${store.config.label}`}
            {...(nichtKonformeInhalte ? { nichtKonformeInhalte } : {})}
            {...(schlichtungsstelle ? { schlichtungsstelle } : {})}
          />
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zur Startseite
          </Link>
        </div>
      </main>

      <footer className="border-t border-border bg-card px-4 py-4 text-sm text-muted-foreground">
        <div className="mx-auto w-full max-w-4xl">{store.config.kommune}</div>
      </footer>
    </div>
  );
}
