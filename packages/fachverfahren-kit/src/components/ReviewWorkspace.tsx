// fachverfahren-kit/components/ReviewWorkspace — die GENERISCHE interne Prüf-/Entscheidungs-Sicht. Abgeleitet 1:1
// aus der Referenz-UX `ReviewWorkspace.tsx` (sift): RESIZABLE Master-Detail-Evidence-Layout (ResizablePanelGroup) —
// links die Antragsdaten (aus `config.detailSektionen`), Mitte/rechts ein getabter Belege-Panel (Dokumente/Formular/
// Prüfschema), darüber KI-Vorschlag + Status + Audit-Trail. ABER streng config-getrieben: NICHTS Domänen-spezifisches
// ist hartkodiert (kein "Hund"/"Halter"). Der Entscheidungs-Flow stammt aus `amt.vorgang.$id.tsx` und läuft über
// `EntscheidungPanel` → `port.uebergang`. Ein zweites Verfahren (Gewerbe/Parkausweis/Bauantrag) läuft unverändert.
import { useMemo, useState } from "react";
import { ArrowLeft, FileText, ListChecks, ScrollText, Stamp } from "lucide-react";
import type { LeistungConfig, Vorgang, VorgangPort } from "../types.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.js";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable.js";
import { StatusPill } from "./StatusPill.js";
import { EvidenceCard } from "./EvidenceCard.js";
import { VorgangDetail, formatWert, getPfad } from "./VorgangDetail.js";
import { EntscheidungPanel } from "./EntscheidungPanel.js";
import { NachweisBrowser, type NachweisEintrag } from "./NachweisBrowser.js";
import { PdfViewer } from "./PdfViewer.js";
import { FourEyesReview, type FourEyesStatus } from "./FourEyesReview.js";

export interface ReviewWorkspaceProps<T = Record<string, unknown>> {
  /** Die Leistungs-Config (Sektionen, Status-Machine, Rechtsgrundlagen, KI-Schwelle …). */
  config: LeistungConfig<T>;
  /** Datenschicht-Port — DEV: Zustand-Store, PROD: SDK/Fastify. */
  port: VorgangPort<T>;
  /** Der zu prüfende Vorgang (per Id). */
  vorgangId: string;
  /** Die handelnde Rolle (steuert die erlaubten Übergänge im EntscheidungPanel). */
  rolle: string;
  /** Schließt die Sicht (z.B. zurück zum Arbeitsvorrat). */
  onClose: () => void;
  /** Optionale Übersetzung eines KI-Flag-Schlüssels (data-driven aus der Leistung). */
  flagLabel?: (flag: string) => string;
  className?: string;
}

/** Leeres Tab-Panel mit Hinweis — generisch (kein Domänen-Inhalt). */
function LeeresPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/** Die interne Prüf-/Entscheidungs-Sicht: Kopf + resizable Master-Detail-Evidence-Layout. */
export function ReviewWorkspace<T = Record<string, unknown>>({
  config,
  port,
  vorgangId,
  rolle,
  onClose,
  flagLabel,
  className,
}: ReviewWorkspaceProps<T>) {
  const vorgang = port.get(vorgangId);
  const [tab, setTab] = useState("dokumente");

  // Belege-Tab „Dokumente": die geforderten Nachweise des Vorgangs (Vertrag), kein Domänen-Literal.
  const nachweise = vorgang?.nachweise ?? [];

  // Belege-Tab „Prüfschema": die Rechtsgrundlagen der Leistung als Belege (Subsumtions-Begründung als Zitat).
  const rechtsgrundlagen = config.rechtsgrundlagen;
  const begruendung = vorgang?.berechnung?.begruendung ?? "";

  // Belege-Tab „Formular": die flachen Antragsfelder aus allen Sektionen (Pfad → Wert), generisch gerendert.
  const formularFelder = useMemo(() => {
    if (!vorgang) return [] as { pfad: string; label: string; wert: string }[];
    return config.detailSektionen.flatMap((s) =>
      s.felder.map((f) => ({
        pfad: f.pfad,
        label: f.label,
        wert: formatWert(getPfad(vorgang.antragsdaten, f.pfad)),
      })),
    );
  }, [config.detailSektionen, vorgang]);

  // ── OPTIONALE Signale (additiv) — nur aktiv, wenn die Config sie trägt ──────────────────────────
  // (1) Aufgewertete Dokumenten-Mappe (NachweisBrowser) NUR wenn die Leistung `nachweise` definiert.
  const hatNachweisVertrag = typeof config.nachweise === "function";
  const nachweisEintraege: NachweisEintrag[] = useMemo(
    () =>
      nachweise.map((n) => ({
        id: n.id,
        titel: n.label,
        pflicht: n.erforderlich ?? false,
        status: n.hochgeladen ? "eingereicht" : n.erforderlich ? "fehlend" : "fehlend",
      })),
    [nachweise],
  );

  // (2) Bescheid-Tab (PdfViewer) NUR wenn ein Bescheid-PDF in der Zustellung hinterlegt ist.
  const bescheidUrl = config.zustellung?.bescheidUrl;

  // (3) 4-Augen-Vorprüfung: anstehende Übergänge (Status + Rolle), die `vierAugen` fordern.
  const vierAugenTransition = useMemo(
    () =>
      vorgang
        ? (config.statusMachine?.transitions ?? []).find(
            (t) => t.from === vorgang.status && t.rollen.includes(rolle) && t.vierAugen === true,
          )
        : undefined,
    [config.statusMachine, vorgang, rolle],
  );

  if (!vorgang) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-4", className)}>
        <p className="text-sm text-muted-foreground">Vorgang nicht gefunden.</p>
        <Button variant="outline" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Zurück
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Kopfleiste — Referenz: Top-Bar mit Zurück-Link, Vorgangsnummer, Status. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Zur Übersicht
          </button>
          <span className="shrink-0 text-muted-foreground/40">/</span>
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                {config.label} · {config.kommune}
              </div>
              <h1 className="truncate font-mono text-lg font-semibold tabular-nums text-foreground leading-tight">
                {vorgang.vorgangsnummer}
              </h1>
            </div>
          </div>
        </div>
        <StatusPill status={vorgang.status} states={config.statusMachine.states} />
      </div>

      {/* Resizable Master-Detail-Evidence-Layout — Referenz: ResizablePanelGroup (links Daten, rechts Belege). */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* LINKS: Antragsdaten + KI-Vorschlag + Audit-Trail (aus VorgangDetail, config-getrieben). */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <div className="h-full overflow-auto p-6">
            <VorgangDetail
              config={config}
              vorgang={vorgang}
              {...(flagLabel ? { flagLabel } : {})}
              zeigeUebergabe={false}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RECHTS: getabter Belege-Panel (Dokumente/Formular/Prüfschema) + Entscheidung. */}
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="dokumente" className="flex-1 gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Dokumente
                  </TabsTrigger>
                  <TabsTrigger value="formular" className="flex-1 gap-1.5">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                    Formular
                  </TabsTrigger>
                  <TabsTrigger value="pruefschema" className="flex-1 gap-1.5">
                    <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                    Prüfschema
                  </TabsTrigger>
                  {/* Bescheid-Tab NUR wenn ein Bescheid-PDF in der Zustellung hinterlegt ist (additiv). */}
                  {bescheidUrl ? (
                    <TabsTrigger value="bescheid" className="flex-1 gap-1.5">
                      <Stamp className="h-3.5 w-3.5" aria-hidden="true" />
                      Bescheid
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                {/* Dokumente: die geforderten Nachweise (Vertrag) mit Status hochgeladen/fehlt.
                    Definiert die Leistung einen `nachweise`-Vertrag, wertet NachweisBrowser die Mappe auf
                    (Vollständigkeits-Hinweis, Provenienz, Vorschau). Sonst die schlanke Liste als Fallback. */}
                <TabsContent value="dokumente">
                  {nachweise.length > 0 ? (
                    hatNachweisVertrag ? (
                      <NachweisBrowser nachweise={nachweisEintraege} titel="Nachweise" />
                    ) : (
                      <ul className="space-y-2">
                        {nachweise.map((n) => (
                          <li
                            key={n.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <FileText
                                className="h-4 w-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="truncate text-foreground">{n.label}</span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                                n.hochgeladen
                                  ? "bg-status-ok-soft text-status-ok"
                                  : n.erforderlich
                                    ? "bg-status-warn-soft text-status-warn"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {n.hochgeladen ? "Hochgeladen" : n.erforderlich ? "Fehlt" : "Optional"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <LeeresPanel text="Keine Nachweise für diesen Vorgang erforderlich." />
                  )}
                </TabsContent>

                {/* Formular: die flachen Antragsfelder (Pfad → Wert) als Übersicht. */}
                <TabsContent value="formular">
                  {formularFelder.length > 0 ? (
                    <dl className="divide-y divide-border rounded-md border border-border bg-card">
                      {formularFelder.map((f) => (
                        <div
                          key={f.pfad}
                          className="flex items-baseline justify-between gap-4 px-3 py-2"
                        >
                          <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
                          <dd className="text-right text-sm text-foreground">{f.wert}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <LeeresPanel text="Keine Antragsfelder hinterlegt." />
                  )}
                </TabsContent>

                {/* Prüfschema: die Rechtsgrundlagen als Belege; die Subsumtions-Begründung als Zitat. */}
                <TabsContent value="pruefschema">
                  {rechtsgrundlagen.length > 0 ? (
                    <div className="space-y-3">
                      {rechtsgrundlagen.map((r, i) => (
                        <EvidenceCard
                          key={i}
                          quelle={{
                            norm: r.norm,
                            titel: r.titel,
                            ...(r.satzung ? { satzung: r.satzung } : {}),
                          }}
                          // Die belegte Herleitung als Zitat am ersten (führenden) Beleg; sonst der Norm-Titel.
                          zitat={i === 0 && begruendung ? begruendung : r.titel}
                          {...(i === 0 && begruendung ? { staerke: "ok" as const } : {})}
                        />
                      ))}
                    </div>
                  ) : (
                    <LeeresPanel text="Keine Rechtsgrundlagen hinterlegt." />
                  )}
                </TabsContent>

                {/* Bescheid: das hinterlegte Bescheid-PDF im barrierearmen Viewer (nur wenn config.zustellung.bescheidUrl). */}
                {bescheidUrl ? (
                  <TabsContent value="bescheid">
                    <PdfViewer url={bescheidUrl} title={`Bescheid · ${vorgang.vorgangsnummer}`} />
                  </TabsContent>
                ) : null}
              </Tabs>
            </div>

            {/* Entscheidung — erlaubte Übergänge aus dem Vertrag, fest am unteren Rand des Belege-Panels. */}
            <div className="shrink-0 space-y-4 border-t border-border bg-muted/20 p-4">
              {/* 4-Augen-Vorprüfung NUR wenn ein anstehender Übergang vierAugen fordert (additiv, sichtbare Schicht). */}
              {vierAugenTransition ? (
                <FourEyesReview
                  vorgangId={vorgang.id}
                  status={fourEyesStatusFuer(vorgang.status, config)}
                  vorlage={{
                    erstellerId: erstellerVon(vorgang),
                    erstelltAmIso: vorgang.eingangIso,
                    entscheidung: vierAugenTransition.label,
                    ...(vorgang.berechnung?.begruendung
                      ? { begruendung: vorgang.berechnung.begruendung }
                      : {}),
                  }}
                  pruefer={{ aktuelleNutzerId: rolle }}
                />
              ) : null}

              <EntscheidungPanel
                config={config}
                port={port}
                vorgang={vorgang}
                rolle={rolle}
                onEntschieden={onClose}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ── 4-Augen-Helfer (generisch, kein Domänen-Literal) ─────────────────────────────────────────────

/** Ersteller-Kennung eines Vorgangs für die Selbstfreigabe-Sperre: erste handelnde Rolle aus der Historie,
 *  sonst der Initial-Eingang. Rein strukturell — keine Domänen-Annahme. */
function erstellerVon<T>(vorgang: Vorgang<T>): string {
  return vorgang.history[0]?.rolle ?? "antragseingang";
}

/** Bildet den Vorgangs-Status auf den FourEyes-Lebenszyklus ab: terminaler Status → freigegeben/abgelehnt,
 *  sonst „vorgelegt" (wartet auf Zweitprüfung). Generisch über den Ziel-Ton der Status-Machine. */
function fourEyesStatusFuer<T>(status: string, config: LeistungConfig<T>): FourEyesStatus {
  const def = (config.statusMachine?.states ?? []).find((s) => s.key === status);
  if (def?.terminal) return def.tone === "block" ? "abgelehnt" : "freigegeben";
  return "vorgelegt";
}
