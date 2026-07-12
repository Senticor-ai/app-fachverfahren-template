// fachverfahren-kit/components/Barrierefreiheitserklaerung — BITV §7 Barrierefreiheitserklärung + Feedback.
//
// Pflicht-Baustein für öffentliche Stellen (§ 12b BGG / BITV 2.0 § 7, EU 2016/2102): ein lesbarer,
// strukturierter Block mit dem Konformitätsstand, den nicht oder teilweise barrierefreien Inhalten, einem
// Feedback-Mechanismus (mailto) sowie dem Verweis auf das Durchsetzungs-/Schlichtungsverfahren.
//
// GENERISCH + DEP-FREI: keine Domänen-Literale — Stand, Inhalte, Kontakt und Schlichtungsstelle kommen
// ausschließlich aus den Props (nur React + lucide + Token-Klassen + Bestands-Primitive Card/Badge).
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - semantische Überschriften-Hierarchie: ein <h2> als Sektions-Titel, <h3> je Unterabschnitt
//  - die Erklärung ist als <section> mit aria-labelledby an ihren Titel gebunden
//  - das Stand-Datum maschinenlesbar über <time dateTime>; der Status nie nur über Farbe (Wort + Icon)
//  - echter <a href="mailto:…">-Link für das Feedback, sichtbarer Fokus-Ring (focus-visible:ring-2),
//    Schlichtungs-Link mit rel="noreferrer" und sr-only-Hinweis „öffnet in neuem Tab"
//  - Icons rein dekorativ (aria-hidden), Zielgröße der Links >= 24px
import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Mail,
  ExternalLink,
  Scale,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Card, CardContent, CardHeader } from "../ui/card.js";
import { Badge, type BadgeProps } from "../ui/badge.js";

/** Konformitätsstand nach BITV 2.0 § 7 Abs. 1. */
export type BarrierefreiheitStatus =
  "konform" | "teilweise-konform" | "nicht-konform";

export interface BarrierefreiheitStand {
  /** Datum der Erstellung/letzten Überprüfung als ISO-8601-String (z. B. "2026-06-27"). */
  datumIso: string;
  /** Konformitätsstand der Stelle. */
  status: BarrierefreiheitStatus;
}

export interface BarrierefreiheitSchlichtungsstelle {
  /** Name der Durchsetzungs-/Schlichtungsstelle. */
  name: string;
  /** Verweis (URL) auf das Schlichtungsverfahren. */
  url: string;
}

export interface BarrierefreiheitserklaerungProps {
  /** Stand der Erklärung: Datum (ISO) + Konformitätsstatus. */
  stand: BarrierefreiheitStand;
  /** Auflistung der (noch) nicht barrierefreien Inhalte. Nur relevant bei teilweiser/keiner Konformität. */
  nichtKonformeInhalte?: string[];
  /** E-Mail-Adresse für den Feedback-Mechanismus (mailto). */
  feedbackEmail: string;
  /** Optionaler Verweis auf die Durchsetzungs-/Schlichtungsstelle. */
  schlichtungsstelle?: BarrierefreiheitSchlichtungsstelle;
  /** Überschrift der Erklärung (Default: „Erklärung zur Barrierefreiheit"). */
  titel?: string;
  /** Optionaler Betreff für die Feedback-E-Mail (Default: der Titel). */
  feedbackBetreff?: string | undefined;
  className?: string;
}

/** Anzeige-Metadaten je Status: Klartext, Ton (Badge) und dekoratives Icon — Information nie nur über Farbe. */
const STATUS_META: Record<
  BarrierefreiheitStatus,
  { label: string; tone: NonNullable<BadgeProps["tone"]>; icon: LucideIcon }
> = {
  konform: { label: "vollständig konform", tone: "ok", icon: CheckCircle2 },
  "teilweise-konform": {
    label: "teilweise konform",
    tone: "warn",
    icon: AlertTriangle,
  },
  "nicht-konform": { label: "nicht konform", tone: "block", icon: XCircle },
};

/** Formatiert ein ISO-Datum für die Anzeige (de-DE, langes Datum); fällt bei Unparsbarkeit auf den Rohwert zurück. */
function formatiereDatum(datumIso: string): string {
  const d = new Date(datumIso);
  if (Number.isNaN(d.getTime())) return datumIso;
  try {
    return d.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return datumIso;
  }
}

/** Baut einen mailto:-Link mit optionalem Betreff (korrekt kodiert). */
function baueMailto(email: string, betreff: string): string {
  const adresse = email.replace(/^mailto:/i, "").trim();
  return `mailto:${adresse}?subject=${encodeURIComponent(betreff)}`;
}

/**
 * Barrierefreiheitserklärung nach BITV 2.0 § 7 mit Feedback-Mechanismus.
 *
 * @example
 * <Barrierefreiheitserklaerung
 *   stand={{ datumIso: "2026-06-27", status: "teilweise-konform" }}
 *   nichtKonformeInhalte={["Eingescannte Altbescheide (PDF) sind nicht durchsuchbar."]}
 *   feedbackEmail="barrierefreiheit@example.de"
 *   schlichtungsstelle={{ name: "Schlichtungsstelle BGG", url: "https://www.schlichtungsstelle-bgg.de" }}
 * />
 */
export function Barrierefreiheitserklaerung({
  stand,
  nichtKonformeInhalte,
  feedbackEmail,
  schlichtungsstelle,
  titel = "Erklärung zur Barrierefreiheit",
  feedbackBetreff,
  className,
}: BarrierefreiheitserklaerungProps): React.ReactElement {
  const titelId = React.useId();
  const meta = STATUS_META[stand.status];
  const StatusIcon = meta.icon;
  const datumLesbar = formatiereDatum(stand.datumIso);
  // Nur echte Einträge listen — leere Strings/Lücken werden defensiv gefiltert.
  const inhalte = (nichtKonformeInhalte ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const mailtoLink = baueMailto(feedbackEmail, feedbackBetreff ?? titel);

  return (
    <section aria-labelledby={titelId} className={cn("w-full", className)}>
      <Card>
        <CardHeader>
          {/* Echtes <h2> als Sektions-Titel (CardTitle ist ein <div> ohne asChild) — semantische Hierarchie. */}
          <h2
            id={titelId}
            className="font-semibold leading-none tracking-tight"
          >
            {titel}
          </h2>
        </CardHeader>

        <CardContent className="space-y-8 text-sm leading-relaxed text-foreground">
          {/* Stand der Vereinbarkeit mit den Anforderungen */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              Stand der Vereinbarkeit mit den Anforderungen
            </h3>
            <p className="text-muted-foreground">
              Diese Anwendung ist mit den Anforderungen der Barrierefreiheit{" "}
              <span className="font-medium text-foreground">{meta.label}</span>.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Status redundant: Wort im Badge + dekoratives Icon — nicht allein über Farbe. */}
              <Badge tone={meta.tone}>
                <StatusIcon aria-hidden="true" className="size-3.5" />
                {meta.label}
              </Badge>
              <span className="text-muted-foreground">
                Stand:{" "}
                <time
                  dateTime={stand.datumIso}
                  className="font-medium text-foreground"
                >
                  {datumLesbar}
                </time>
              </span>
            </div>
          </div>

          {/* Nicht barrierefreie Inhalte — nur wenn vorhanden */}
          {inhalte.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Nicht barrierefreie Inhalte
              </h3>
              <p className="text-muted-foreground">
                Die nachstehend aufgeführten Inhalte sind aus den genannten
                Gründen nicht oder nicht vollständig barrierefrei:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-muted-foreground">
                {inhalte.map((eintrag, i) => (
                  <li key={i}>{eintrag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback-Mechanismus (Pflicht) */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              Barrieren melden: Feedback und Kontakt
            </h3>
            <p className="text-muted-foreground">
              Sind Ihnen Mängel beim barrierefreien Zugang aufgefallen oder
              benötigen Sie Informationen in einer barrierefreien Form? Teilen
              Sie uns dies gerne mit:
            </p>
            <a
              href={mailtoLink}
              className={cn(
                "inline-flex min-h-[24px] items-center gap-2 rounded-sm font-medium text-primary",
                "underline-offset-4 hover:underline",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              {feedbackEmail.replace(/^mailto:/i, "")}
            </a>
          </div>

          {/* Durchsetzungs-/Schlichtungsverfahren — optional */}
          {schlichtungsstelle && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Durchsetzungsverfahren
              </h3>
              <p className="text-muted-foreground">
                Falls Sie auf Ihre Meldung keine zufriedenstellende Antwort
                erhalten, können Sie sich an die folgende Schlichtungsstelle
                wenden:
              </p>
              <a
                href={schlichtungsstelle.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex min-h-[24px] items-center gap-2 rounded-sm font-medium text-primary",
                  "underline-offset-4 hover:underline",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Scale aria-hidden="true" className="size-4 shrink-0" />
                {schlichtungsstelle.name}
                <ExternalLink
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
                <span className="sr-only">(öffnet in einem neuen Tab)</span>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
