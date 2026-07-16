// /amt/akten — die schlanke Akten-/Klientenliste der Sachbearbeitung über der Fall/Dossier-API.
// Data-driven über casePort.listCases; Klick auf eine Karte öffnet die 360°-Sicht /amt/akte/:id.
// Analog zum Boards-Muster (BoardList): Lade-/Fehler-/Leer-Zustand, Karten-Grid (reflowt bei Zoom).
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Inbox, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from "@senticor/fachverfahren-kit";
import { casePort } from "../app/case-port.js";
import type { CaseSummary } from "../case-client.js";
import { Shell } from "../app/shell.js";
import { NeueAkteForm } from "./neue-akte-form.js";

export function AmtAktenPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCases(await casePort.listCases());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function open(caseId: string): void {
    navigate(`/amt/akte/${encodeURIComponent(caseId)}`);
  }

  return (
    <Shell persona="sachbearbeitung" activeNavKey="akten">
      <section className="mx-auto w-full max-w-5xl px-6 py-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderOpen
              className="h-5 w-5 text-foreground"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-semibold text-foreground">Akten</h1>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm((visible) => !visible)}
            aria-expanded={showForm}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Neue Akte
          </Button>
        </div>

        {showForm && (
          <div className="mt-4">
            <NeueAkteForm
              onCreated={(caseId) => open(caseId)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              role="status"
              aria-label="Akten werden geladen"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <SkeletonCard key={index} className="h-32" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title="Akten konnten nicht geladen werden"
              description="Bitte erneut versuchen. Besteht das Problem fort, ist die Sitzung ggf. abgelaufen."
              onRetry={() => void reload()}
            />
          ) : !cases || cases.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Noch keine Akten"
              description="Sobald ein Fall angelegt ist, erscheint er hier."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cases.map((akte) => (
                <Card
                  key={akte.caseId}
                  role="link"
                  tabIndex={0}
                  aria-label={`Akte ${akte.caseId} öffnen`}
                  className="cursor-pointer transition-colors hover:bg-secondary/40 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                  onClick={() => open(akte.caseId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(akte.caseId);
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="truncate">
                        {akte.subjectIds[0] ?? akte.caseId}
                      </span>
                      <Badge tone="info">{akte.state}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {akte.procedureId}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}
