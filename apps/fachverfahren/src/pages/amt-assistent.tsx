// /amt/assistent — der COMPOSABLE-ASSISTENT (Ziel-1 S5): jedes Agentic Composable mit Spine-Agent ist als
// LINGUISTISCHER Agent chattbar — governed (RBAC ai.assist, AAL-Decke, HITL), GEERDET auf das kuratierte
// Verfahrens-Wissen seiner knowledgeDomains und je Runde EVIDENZIERT (chat.turn im hash-verketteten Ledger).
// REUSE=MOUNTEN: die Sicht mountet die FERTIGE Chat-Insel des Kits (AssistentPanel + KiChatPort) über den
// composable-chat-client-Adapter — kein zweites Chat-UI. Das DATEN-Signal `LeistungConfig.ki.chat` schaltet
// die Fläche frei (dieselbe 3-Schichten-Logik wie KiAssist: Config bietet an ∧ Port injiziert).
import { useEffect, useMemo, useState } from "react";
import type { ComposableSummaryDto } from "@senticor/app-bff-contracts";
import { AssistentPanel, Callout } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import {
  erstelleComposableChatPort,
  ladeComposables,
} from "../composable-chat-client.js";
import { store } from "../store.js";

export function AmtAssistentPage(): React.JSX.Element {
  const chatConfig = store.config.ki?.chat;
  const [composables, setComposables] = useState<ComposableSummaryDto[]>([]);
  const [ausgewaehlt, setAusgewaehlt] = useState<string | undefined>();
  const [status, setStatus] = useState<"laedt" | "idle" | "fehler">("laedt");

  useEffect(() => {
    let ab = false;
    ladeComposables()
      .then((liste) => {
        if (ab) return;
        // Chattbar = mit Spine-Agent (die linguistische Fähigkeit); enabled zuerst.
        const chattbar = liste
          .filter((c) => c.hasSpine)
          .sort((a, b) => Number(b.enabled) - Number(a.enabled));
        setComposables(chattbar);
        setAusgewaehlt(chattbar[0]?.id);
        setStatus("idle");
      })
      .catch(() => {
        if (!ab) setStatus("fehler");
      });
    return () => {
      ab = true;
    };
  }, []);

  // Ein Port je Auswahl; ohne ki.chat-Angebot KEIN Port — das AssistentPanel rendert dann seinen
  // deaktivierten Zustand (Insel-eigener Hinweis, kein zweiter Leerzustand hier).
  const chatPort = useMemo(
    () =>
      chatConfig && ausgewaehlt
        ? erstelleComposableChatPort(ausgewaehlt)
        : undefined,
    [chatConfig, ausgewaehlt],
  );
  const aktiv = composables.find((c) => c.id === ausgewaehlt);

  return (
    <Shell persona="sachbearbeitung" activeNavKey="assistent">
      <section className="mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-lg font-semibold text-foreground">Assistent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chatConfig?.zweck ??
            "Chattbare Fähigkeitseinheiten (Agentic Composables) dieses Fachverfahrens."}{" "}
          Antworten sind geerdet auf das Verfahrens-Wissen, gekennzeichnet und
          je Runde nachvollziehbar protokolliert — die Entscheidung bleibt bei
          Ihnen.
        </p>

        {status === "fehler" ? (
          <Callout tone="warn" title="Composables nicht ladbar" className="mt-4">
            Die Composable-Liste konnte nicht geladen werden. Bitte erneut
            versuchen.
          </Callout>
        ) : null}

        {composables.length > 1 ? (
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Composable wählen"
          >
            {composables.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAusgewaehlt(c.id)}
                aria-pressed={c.id === ausgewaehlt}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  c.id === ausgewaehlt
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {c.displayName}
                {!c.enabled ? (
                  <span className="ml-1.5 text-xs opacity-75">
                    ({c.status})
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <AssistentPanel
          key={ausgewaehlt ?? "kein-composable"}
          chatPort={chatPort}
          titel={aktiv ? `Assistent · ${aktiv.displayName}` : "Assistent"}
          platzhalter="Frage an das Composable — Antworten sind geerdet und zu prüfen …"
          className="mt-4"
        />
      </section>
    </Shell>
  );
}
