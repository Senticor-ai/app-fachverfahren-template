// fachverfahren-kit/components/EntscheidungPanel — die GENERISCHE Entscheidungs-Aktion (Festsetzen/Ablehnen/Zur
// Prüfung …). Abgeleitet aus etablierten Public-Sector-UX-Mustern für die interne Fallbearbeitung: Aktions-Karte
// mit Override-Hinweis + Audit-Protokollierung. ABER streng config-getrieben: die Buttons entstehen aus den ERLAUBTEN
// Übergängen für (`vorgang.status`, `rolle`) — `config.statusMachine.transitions`. 4-Augen-Hinweis bei `vierAugen`,
// Begründungs-Pflichtfeld bei `detailPflicht`. Kein Domänen-Literal — ein zweites Verfahren läuft unverändert.
import { useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useUebergang } from "../hooks/use-vorgang-resource.js";
import type {
  LeistungConfig,
  Transition,
  Vorgang,
  VorgangPort,
} from "../types.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Textarea } from "../ui/textarea.js";
import { Label } from "../ui/label.js";

/** Icon je Übergang — generisch über den Ziel-Ton (terminal-ok → Check, terminal-block → X, sonst neutral). */
function transitionIcon(toTone: string | undefined) {
  if (toTone === "ok") return Check;
  if (toTone === "block") return X;
  return undefined;
}

export interface EntscheidungPanelProps<T = Record<string, unknown>> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  vorgang: Vorgang<T>;
  /** Die handelnde Rolle (entscheidet, welche Übergänge erlaubt sind). */
  rolle: string;
  /** Der HANDELNDE (pseudonymes Kürzel/Nutzer-ID) — optional, wird als `history[].akteur` geführt.
   *  Bei `vierAugen`-Übergängen prüft der Port damit, dass ZWEI VERSCHIEDENE Personen handeln (Vier-Augen-Nachweis). */
  akteur?: string;
  /** Nach erfolgreichem Übergang aufgerufen (z.B. zurück zum Arbeitsvorrat). */
  onEntschieden?: (to: string) => void;
  className?: string;
}

/** Rendert die für (Status, Rolle) erlaubten Übergänge als Aktionen; erzwingt Pflicht-Begründung + 4-Augen-Hinweis. */
export function EntscheidungPanel<T = Record<string, unknown>>({
  config,
  port,
  vorgang,
  rolle,
  akteur,
  onEntschieden,
  className,
}: EntscheidungPanelProps<T>) {
  // Erlaubte Übergänge AUSSCHLIESSLICH aus dem Vertrag (from === aktueller Status, Rolle berechtigt).
  // DEFENSIV gegen eine unvollständig generierte Config (statusMachine evtl. nicht vertragskonform).
  const transitions = (config.statusMachine?.transitions ?? []).filter(
    (t) => t.from === vorgang.status && t.rollen.includes(rolle),
  );
  const states = config.statusMachine?.states ?? [];
  const toneOf = (key: string) => states.find((s) => s.key === key)?.tone;

  const {
    pending: transitionPending,
    error: transitionError,
    uebergang: doUebergang,
    reset: resetTransitionError,
  } = useUebergang(port);

  // Pro Übergang ein eigenes Begründungsfeld (nur bei detailPflicht sichtbar/erforderlich).
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [validationFehler, setValidationFehler] = useState<string | null>(null);

  const fehler = validationFehler ?? transitionError?.message ?? null;

  const aktuellerStatus = states.find((s) => s.key === vorgang.status);

  // Terminalstatus oder keine erlaubten Übergänge: keine Aktionen — nur Hinweis (Referenz blendet die Karte aus).
  if (aktuellerStatus?.terminal || transitions.length === 0) {
    return (
      <section
        className={cn("rounded-md border border-border bg-card p-5", className)}
      >
        <h2 className="text-sm font-semibold text-foreground">Entscheidung</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {aktuellerStatus?.terminal
            ? `Vorgang abgeschlossen (${aktuellerStatus.label}) — keine weiteren Übergänge.`
            : "Für Ihre Rolle sind in diesem Status keine Aktionen verfügbar."}
        </p>
      </section>
    );
  }

  async function ausloesen(t: Transition) {
    const text = (detail[t.to] ?? "").trim();
    if (t.detailPflicht && !text) {
      setValidationFehler(`"${t.label}" erfordert eine Begründung.`);
      return;
    }
    setValidationFehler(null);
    resetTransitionError();
    // Übergang über den Port — DEV: Zustand-Store, PROD: SDK/Fastify. 4-Augen wird serverseitig erzwungen;
    // der akteur macht den Vier-Augen-Nachweis in der History führbar (zwei VERSCHIEDENE Personen).
    // useUebergang verhindert Doppel-Submit (inFlight-Guard) und generiert den idempotency key.
    const next = await doUebergang(
      vorgang.id,
      t.to,
      rolle,
      text || undefined,
      akteur,
    );
    if (next) {
      onEntschieden?.(t.to);
    }
  }

  return (
    <section
      className={cn("rounded-md border border-border bg-card p-5", className)}
    >
      <h2 className="text-sm font-semibold text-foreground">Entscheidung</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ein Override des KI-Vorschlags wird im Audit-Trail protokolliert.
      </p>

      <div className="mt-4 space-y-4">
        {transitions.map((t) => {
          const Icon = transitionIcon(toneOf(t.to));
          const tone = toneOf(t.to);
          // Primär = positive/terminal-ok-Aktion; Ablehnung (block) = outline; sonst sekundär.
          const variant =
            tone === "ok"
              ? "default"
              : tone === "block"
                ? "outline"
                : "secondary";

          return (
            <div key={`${t.from}-${t.to}`} className="space-y-2">
              {t.detailPflicht && (
                <div className="space-y-1.5">
                  <Label htmlFor={`detail-${t.to}`} className="text-xs">
                    Begründung <span className="text-status-block">*</span>
                  </Label>
                  <Textarea
                    id={`detail-${t.to}`}
                    rows={3}
                    placeholder={`Begründung für "${t.label}" …`}
                    value={detail[t.to] ?? ""}
                    onChange={(e) =>
                      setDetail((d) => ({ ...d, [t.to]: e.target.value }))
                    }
                    className="text-sm"
                  />
                </div>
              )}

              <Button
                variant={variant}
                className="w-full justify-between"
                disabled={transitionPending}
                onClick={() => void ausloesen(t)}
              >
                {transitionPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {t.label}
                {!transitionPending && Icon ? (
                  <Icon className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </Button>

              {t.vierAugen && (
                <p className="flex items-center gap-1.5 text-xs text-status-warn">
                  <ShieldCheck
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  4-Augen-Prinzip: Bestätigung durch eine zweite berechtigte
                  Person erforderlich.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {fehler && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-1.5 rounded-md border border-status-block/30 bg-status-block-soft px-3 py-2 text-sm text-foreground"
        >
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 text-status-block"
            aria-hidden="true"
          />
          {fehler}
        </p>
      )}
    </section>
  );
}
