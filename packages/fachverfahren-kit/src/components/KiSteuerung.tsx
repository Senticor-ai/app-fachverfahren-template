// fachverfahren-kit/components/KiSteuerung — das kontrollierte Einstell-Panel „der Mensch schaltet die KI".
//
// Zeigt AUSSCHLIESSLICH die Schalter, die das Verfahren anbietet (assist/chat/voice via `config.ki`, extraktion via
// `extraktionVerfuegbar`) — nie mehr. Ein Hauptschalter, je Feature ein Switch, eine gedeckelte Autonomie-Schwelle
// (Slider) sowie die Transparenz-Tiefe (Radiogruppe). Ein deutlich sichtbarer, NICHT abschaltbarer Hinweis hält fest:
// „Der Mensch entscheidet — KI assistiert nur." (humanOversight ist strukturell erzwungen). Jede Änderung wird über
// StatusRegion angesagt.
//
// Kontrolliert: die Komponente hält KEINEN eigenen Zustand der Präferenz, sondern baut den nächsten Wert und ruft
// `onChange` (das Speichern übernimmt z. B. `useKiSteuerung`). Vendor-neutral, token-getrieben, BITV 2.0 / WCAG 2.2 AA.
import * as React from "react";
import { ShieldCheck } from "lucide-react";

import type { LeistungConfig } from "../types.js";
import type { KiFeature, KiSteuerung, TransparenzLevel } from "../lib/ki-steuerung.js";
import { effektiveSchwelle, featureAngeboten } from "../lib/ki-steuerung.js";
import { cn } from "../lib/utils.js";
import { Switch } from "../ui/switch.js";
import { Slider } from "../ui/slider.js";
import { Label } from "../ui/label.js";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.js";
import { Callout } from "./Callout.js";
import { StatusRegion } from "./StatusRegion.js";

/** Reihenfolge + generische Beschriftung der Features (keine Domänen-Literale). */
const FEATURE_META: Record<KiFeature, { label: string; beschreibung: string }> = {
  assist: {
    label: "KI-Assistenz",
    beschreibung: "Vorschläge zur Bearbeitung — jeder Vorschlag wird von einem Menschen bestätigt.",
  },
  extraktion: {
    label: "Dokumenten-Extraktion",
    beschreibung: "Felder aus hochgeladenen Nachweisen vorschlagen (zur Bestätigung).",
  },
  chat: {
    label: "KI-Assistent (Chat)",
    beschreibung: "Assistierender Dialog zur Leistung — unverbindliche Auskunft.",
  },
  voice: {
    label: "Spracheingabe",
    beschreibung: "Diktat statt Tastatureingabe.",
  },
};

const FEATURE_REIHENFOLGE: readonly KiFeature[] = ["assist", "extraktion", "chat", "voice"];

/** Transparenz-Stufen mit generischer Erläuterung (Art. 50 EU-AI-Act: Kennzeichnungs-Tiefe). */
const TRANSPARENZ_META: readonly {
  value: TransparenzLevel;
  label: string;
  beschreibung: string;
}[] = [
  { value: "minimal", label: "Minimal", beschreibung: "Nur die Kennzeichnung, dass KI beteiligt war." },
  { value: "standard", label: "Standard", beschreibung: "Kennzeichnung, Quelle und Konfidenz je Vorschlag." },
  { value: "ausfuehrlich", label: "Ausführlich", beschreibung: "Zusätzlich Begründung und Fundstellen." },
];

function prozent(anteil: number): number {
  return Math.round(Math.min(1, Math.max(0, anteil)) * 100);
}

function istTransparenz(w: string): w is TransparenzLevel {
  return w === "minimal" || w === "standard" || w === "ausfuehrlich";
}

export interface KiSteuerungPanelProps {
  /** Das KI-ANGEBOT des Verfahrens (`config.ki`) — bestimmt, welche Schalter überhaupt erscheinen. */
  config: LeistungConfig["ki"];
  /** Bietet das Verfahren eine Dokumenten-Extraktion an (Port/Upload vorhanden)? */
  extraktionVerfuegbar?: boolean;
  /** Die aktuelle Präferenz (kontrolliert). */
  steuerung: KiSteuerung;
  /** Wird mit der NÄCHSTEN Präferenz aufgerufen (Speichern übernimmt der Aufrufer, z. B. useKiSteuerung). */
  onChange: (next: KiSteuerung) => void;
  className?: string;
}

/**
 * Kontrolliertes Einstell-Panel für die KI-Präferenz. Rendert nur angebotene Features, deckelt die Autonomie-
 * Schwelle auf die Config-Obergrenze (der Mensch kann nur strenger stellen) und sagt jede Änderung an.
 *
 * Heißt bewusst `KiSteuerungPanel` (nicht `KiSteuerung`), um die Namenskollision mit dem gleichnamigen TYP
 * `KiSteuerung` (lib/ki-steuerung) im Barrel-Export (`export *`) zu vermeiden.
 */
export function KiSteuerungPanel({
  config,
  extraktionVerfuegbar = false,
  steuerung,
  onChange,
  className,
}: KiSteuerungPanelProps) {
  const [ansage, setAnsage] = React.useState("");
  const basisId = React.useId();
  const titelId = `${basisId}-titel`;
  const aktivId = `${basisId}-aktiv`;
  const transparenzLegendeId = `${basisId}-transparenz`;
  const schwelleId = `${basisId}-schwelle`;

  const angeboten = FEATURE_REIHENFOLGE.filter((f) =>
    featureAngeboten(f, config, extraktionVerfuegbar),
  );
  const zeigeSchwelle = config?.assist != null;
  const floor = config?.assist?.maxSchwelleAutonom ?? 0;
  const wirksameSchwelle = effektiveSchwelle(steuerung, config);

  const aktualisiere = React.useCallback(
    (next: KiSteuerung, text: string) => {
      onChange(next);
      setAnsage(text);
    },
    [onChange],
  );

  const setFeature = (feature: KiFeature, on: boolean) => {
    aktualisiere(
      { ...steuerung, features: { ...steuerung.features, [feature]: on } },
      `${FEATURE_META[feature].label} ${on ? "aktiviert" : "deaktiviert"}.`,
    );
  };

  const setAktiv = (on: boolean) => {
    aktualisiere(
      { ...steuerung, aktiv: on },
      on
        ? "KI-Unterstützung aktiviert."
        : "KI-Unterstützung ausgeschaltet — alle KI-Funktionen sind aus.",
    );
  };

  const setTransparenz = (level: TransparenzLevel) => {
    const meta = TRANSPARENZ_META.find((t) => t.value === level);
    aktualisiere(
      { ...steuerung, transparenzLevel: level },
      `Transparenz auf „${meta?.label ?? level}" gestellt.`,
    );
  };

  const setSchwelle = (n: number) => {
    aktualisiere(
      { ...steuerung, schwelleAutonom: n },
      `Autonomie-Schwelle auf ${prozent(n)} Prozent gestellt.`,
    );
  };

  return (
    <section
      aria-labelledby={titelId}
      className={cn(
        "fv-enter space-y-5 rounded-lg border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      {/* Kopf + Hauptschalter */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titelId} className="text-base font-semibold text-foreground">
            KI-Steuerung
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sie schalten, welche KI-Funktionen Sie unterstützen. Ausgeschaltet wirkt keine.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Label htmlFor={aktivId} className="cursor-pointer text-sm font-medium text-foreground">
            KI-Unterstützung
          </Label>
          <span
            aria-hidden="true"
            className={cn(
              "text-sm font-medium",
              steuerung.aktiv ? "text-status-ok" : "text-muted-foreground",
            )}
          >
            {steuerung.aktiv ? "An" : "Aus"}
          </span>
          <Switch
            id={aktivId}
            checked={steuerung.aktiv}
            onCheckedChange={setAktiv}
          />
        </div>
      </div>

      {/* NICHT abschaltbarer Hinweis (humanOversight) — mehrkanalig: Icon + Text. */}
      <Callout
        tone="info"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
        title="Der Mensch entscheidet — KI assistiert nur."
      >
        Jeder KI-Vorschlag wird von einem Menschen geprüft und freigegeben. Diese Aufsicht lässt
        sich nicht abschalten.
      </Callout>

      {/* Feature-Schalter — nur die vom Verfahren angebotenen. */}
      <fieldset
        disabled={!steuerung.aktiv}
        className="space-y-1 disabled:opacity-60"
      >
        <legend className="mb-2 text-sm font-semibold text-foreground">
          KI-Funktionen
        </legend>
        {angeboten.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dieses Verfahren bietet derzeit keine KI-Funktionen an.
          </p>
        ) : (
          angeboten.map((feature) => {
            const meta = FEATURE_META[feature];
            const feldId = `${basisId}-feature-${feature}`;
            const beschreibungId = `${feldId}-beschreibung`;
            return (
              <div
                key={feature}
                className="flex items-start justify-between gap-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Label htmlFor={feldId} className="cursor-pointer text-foreground">
                    {meta.label}
                  </Label>
                  <p id={beschreibungId} className="mt-0.5 text-sm text-muted-foreground">
                    {meta.beschreibung}
                  </p>
                </div>
                <Switch
                  id={feldId}
                  checked={steuerung.features[feature]}
                  onCheckedChange={(on) => setFeature(feature, on)}
                  aria-describedby={beschreibungId}
                  className="mt-0.5 shrink-0"
                />
              </div>
            );
          })
        )}
        {!steuerung.aktiv && angeboten.length > 0 ? (
          <p className="pt-1 text-sm text-muted-foreground">
            KI-Unterstützung ist ausgeschaltet — die Funktionen sind derzeit nicht wirksam.
          </p>
        ) : null}
      </fieldset>

      {/* Autonomie-Schwelle — nur wenn Assistenz angeboten wird; gedeckelt auf die Config-Obergrenze. */}
      {zeigeSchwelle ? (
        <fieldset
          disabled={!steuerung.aktiv}
          className="space-y-3 disabled:opacity-60"
        >
          <legend className="text-sm font-semibold text-foreground">
            Autonomie-Schwelle
          </legend>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={schwelleId} className="text-foreground">
              Erforderliche Konfidenz für einen KI-Vorschlag
            </Label>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {prozent(wirksameSchwelle)} %
            </span>
          </div>
          <Slider
            id={schwelleId}
            // Der Radix-Slider ist span-basiert und wird von <fieldset disabled> NICHT automatisch deaktiviert —
            // daher explizit an den Hauptschalter koppeln.
            disabled={!steuerung.aktiv}
            min={floor}
            max={1}
            step={0.05}
            value={[Math.max(floor, steuerung.schwelleAutonom ?? floor)]}
            onValueChange={(werte) => {
              const naechster = werte[0];
              if (naechster !== undefined) setSchwelle(naechster);
            }}
            thumbAriaLabels={["Autonomie-Schwelle in Prozent"]}
          />
          <p className="text-sm text-muted-foreground">
            Sie können die Schwelle nur strenger (höher) stellen als die Vorgabe des Verfahrens
            ({prozent(floor)} %). Unterhalb bleibt die menschliche Freigabe ohnehin zwingend.
          </p>
        </fieldset>
      ) : null}

      {/* Transparenz-Tiefe (Radiogruppe). */}
      {angeboten.length > 0 ? (
        <fieldset className="space-y-3">
          <legend
            id={transparenzLegendeId}
            className="text-sm font-semibold text-foreground"
          >
            Transparenz der KI-Kennzeichnung
          </legend>
          <RadioGroup
            aria-labelledby={transparenzLegendeId}
            value={steuerung.transparenzLevel}
            onValueChange={(v) => {
              if (istTransparenz(v)) setTransparenz(v);
            }}
          >
            {TRANSPARENZ_META.map((stufe) => {
              const stufeId = `${basisId}-transparenz-${stufe.value}`;
              return (
                <div key={stufe.value} className="flex items-start gap-3 py-1">
                  <RadioGroupItem value={stufe.value} id={stufeId} className="mt-1" />
                  <Label htmlFor={stufeId} className="flex-1 cursor-pointer">
                    <span className="block font-medium text-foreground">{stufe.label}</span>
                    <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                      {stufe.beschreibung}
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>
      ) : null}

      {/* EINE Ansage-Region für jede Änderung (höflich). */}
      <StatusRegion message={ansage} politeness="polite" />
    </section>
  );
}
