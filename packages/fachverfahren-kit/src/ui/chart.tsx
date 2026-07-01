// fachverfahren-kit/ui/chart — token-gestylte Recharts-Wrapper für das Intelligence-/Reporting-Layer.
//
// GENERISCH + barrierefrei (BITV/WCAG 2.2 AA): ein SVG-Chart ist für Screenreader leer, daher rendert JEDE
// Karte zusätzlich eine vollständige `sr-only` Daten-TABELLE (caption + th/td) als gleichwertige, zugängliche
// Alternative. Reihenfarben kommen ausschließlich aus den Design-Tokens (--color-chart-1..4 = primary + status),
// niemals aus Recharts-Defaults — gesetzt über CSS-Variablen, die der `ChartContainer` bereitstellt.
//
// Keine Domänen-Literale: Achsen, Reihen und Werte kommen allein über `data`/`series`/`xKey` als Props.
"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "../lib/utils.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card.js";

// ── Daten-Vertrag ────────────────────────────────────────────────────────────────────────────
/** Ein Datensatz: der x-Schlüssel plus beliebig viele numerische Reihen-Werte. */
export type ChartDatum = Record<string, string | number | null | undefined>;

/** Eine darzustellende Reihe — `key` adressiert das Feld in `data`, `label` ist die zugängliche Bezeichnung. */
export interface ChartSeries {
  /** Feld-Schlüssel in den Datensätzen (z.B. "anzahl"). */
  key: string;
  /** Menschlich lesbares Label für Legende, Tooltip und sr-only-Tabelle. */
  label: string;
  /** 1-basierter Token-Index (1..4 → --color-chart-1..4). Default: Reihenfolge in `series`. */
  colorIndex?: number;
}

// ── Token-Farbpalette ────────────────────────────────────────────────────────────────────────
/** Anzahl der in styles.css definierten Chart-Token (--color-chart-1..4). */
const CHART_TOKEN_COUNT = 4;

/** CSS-Variablenname der Reihe `i` (0-basiert) — zyklisch über die vorhandenen Token-Farben. */
function chartVar(i: number): string {
  return `--color-chart-${(i % CHART_TOKEN_COUNT) + 1}`;
}

/** `var(--color-chart-N)`-Referenz für eine Reihe — nutzt deren `colorIndex` falls gesetzt, sonst die Position. */
function seriesColor(series: ChartSeries, fallbackIndex: number): string {
  const idx =
    series.colorIndex && series.colorIndex >= 1
      ? series.colorIndex - 1
      : fallbackIndex;
  return `var(${chartVar(idx)})`;
}

// ── ChartContainer ───────────────────────────────────────────────────────────────────────────
export interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Höhe des Diagramm-Bereichs (CSS-Länge). Default 16rem (256px) — innerhalb der Spacing-Skala. */
  height?: string;
}

/**
 * Setzt die Reihen-Farb-Variablen (`--chart-color-0..n`) aus den Tokens und stellt einen festen,
 * responsiven Rahmen für ein darin gemountetes Recharts-`ResponsiveContainer`. Reines Layout —
 * der konkrete Chart kommt als `children`.
 */
export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  ChartContainerProps
>(({ className, style, height = "16rem", children, ...props }, ref) => {
  // Eine stabile CSS-Variablen-Map für bis zu CHART_TOKEN_COUNT Reihen-Farben aus den Tokens.
  const colorVars = React.useMemo<React.CSSProperties>(() => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < CHART_TOKEN_COUNT; i++) {
      vars[`--chart-color-${i}`] = `var(${chartVar(i)})`;
    }
    return vars as React.CSSProperties;
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        // Recharts-Innenleben token-konform tönen (Tooltip-Cursor, Grid, Achsen-Schrift).
        "w-full text-xs text-muted-foreground",
        "[&_.recharts-cartesian-grid_line]:stroke-border",
        "[&_.recharts-cartesian-axis-line]:stroke-border",
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
        "[&_.recharts-tooltip-cursor]:fill-muted/40",
        "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
        // Tooltip-Elevation token-konform über die Schatten-Utility statt eines Inline-rgb()-Schattens.
        "[&_.recharts-tooltip-wrapper]:shadow-md",
        "[&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
        className,
      )}
      style={{ ...colorVars, height, ...style }}
      {...props}
    >
      {children}
    </div>
  );
});
ChartContainer.displayName = "ChartContainer";

// ── Zugängliche Daten-Tabelle (sr-only) ────────────────────────────────────────────────────────
function chartCellText(v: ChartDatum[string]): string {
  if (v === undefined || v === null) return "—";
  return String(v);
}

/**
 * Vollwertige Tabelle als Screenreader-Alternative zum (für SR leeren) SVG. Optisch verborgen via
 * `sr-only`, aber im DOM und im A11y-Baum vorhanden. `caption` benennt die Daten, die Spalten sind
 * x-Achse + alle Reihen.
 */
function ChartDataTable({
  caption,
  data,
  series,
  xKey,
  xLabel,
}: {
  caption: string;
  data: ChartDatum[];
  series: ChartSeries[];
  xKey: string;
  xLabel: string;
}): React.ReactElement {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{xLabel}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            <th scope="row">{chartCellText(row[xKey])}</th>
            {series.map((s) => (
              <td key={s.key}>{chartCellText(row[s.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Gemeinsamer Karten-Rahmen ──────────────────────────────────────────────────────────────────
interface ChartCardBaseProps {
  /** Datensätze — generisch (Record). */
  data: ChartDatum[];
  /** Darzustellende Reihen (Feld-Schlüssel + Label). */
  series: ChartSeries[];
  /** Feld-Schlüssel der x-Achse (Kategorien). */
  xKey: string;
  /** Überschrift der Karte (auch caption-Basis der sr-only-Tabelle). */
  title: string;
  /** Optionale Beschreibung unter dem Titel. */
  description?: string;
  /** Lesbares Label der x-Achsen-Spalte in der sr-only-Tabelle. Default: der `xKey`. */
  xLabel?: string;
  /** Container-Höhe (CSS-Länge). */
  height?: string;
  className?: string;
}

/** Karte + Header + ChartContainer + sr-only-Tabelle — der konkrete Recharts-Body kommt als `children`. */
function ChartCardShell({
  data,
  series,
  xKey,
  title,
  description,
  xLabel,
  height,
  className,
  children,
}: ChartCardBaseProps & { children: React.ReactElement }): React.ReactElement {
  const resolvedXLabel = xLabel ?? xKey;
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {/* Das SVG ist für Screenreader leer → per aria-hidden ausgeblendet, die Tabelle ist die Alternative. */}
        <ChartContainer {...(height ? { height } : {})} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </ChartContainer>
        <ChartDataTable
          caption={description ? `${title} — ${description}` : title}
          data={data}
          series={series}
          xKey={xKey}
          xLabel={resolvedXLabel}
        />
      </CardContent>
    </Card>
  );
}

// ── Gemeinsame, token-konforme Achsen/Grid/Tooltip-Bausteine ───────────────────────────────────
const AXIS_TICK = { fontSize: 11 } as const;

/**
 * Token-getöntes Tooltip — `border-border`/`bg-popover`, kein Recharts-Default-Weiß. Die Elevation
 * kommt aus der `shadow-md`-Utility am `.recharts-tooltip-wrapper` (siehe `ChartContainer`), damit hier
 * keine hartkodierte Farbe (rgb/hex) im Inline-Style steht.
 */
function tooltipContentStyle(): React.CSSProperties {
  return {
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-popover)",
    color: "var(--color-popover-foreground)",
    fontSize: "12px",
  };
}

function CommonAxes({ xKey }: { xKey: string }): React.ReactElement {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={false}
        tick={AXIS_TICK}
        tickMargin={8}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        tick={AXIS_TICK}
        tickMargin={8}
        width={40}
      />
    </>
  );
}

// ── BarChartCard ───────────────────────────────────────────────────────────────────────────────
export type BarChartCardProps = ChartCardBaseProps;

/** Balkendiagramm — eine Reihe = ein Balkensatz, Farben aus den Chart-Tokens. */
export const BarChartCard: React.FC<BarChartCardProps> = (props) => {
  const { data, series, xKey } = props;
  return (
    <ChartCardShell {...props}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CommonAxes xKey={xKey} />
        <Tooltip
          contentStyle={tooltipContentStyle()}
          cursor={{ fillOpacity: 0.4 }}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColor(s, i)}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartCardShell>
  );
};

// ── LineChartCard ──────────────────────────────────────────────────────────────────────────────
export type LineChartCardProps = ChartCardBaseProps;

/** Liniendiagramm — eine Linie je Reihe, Farben aus den Chart-Tokens. */
export const LineChartCard: React.FC<LineChartCardProps> = (props) => {
  const { data, series, xKey } = props;
  return (
    <ChartCardShell {...props}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CommonAxes xKey={xKey} />
        <Tooltip
          contentStyle={tooltipContentStyle()}
          cursor={{ strokeOpacity: 0.4 }}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => {
          const color = seriesColor(s, i);
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ChartCardShell>
  );
};

// ── AreaChartCard ──────────────────────────────────────────────────────────────────────────────
export type AreaChartCardProps = ChartCardBaseProps;

/** Flächendiagramm — gefüllte Fläche je Reihe (gestapelt bei mehreren), Farben aus den Chart-Tokens. */
export const AreaChartCard: React.FC<AreaChartCardProps> = (props) => {
  const { data, series, xKey } = props;
  const stacked = series.length > 1;
  return (
    <ChartCardShell {...props}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s, i) => {
            const color = seriesColor(s, i);
            return (
              <linearGradient
                key={s.key}
                id={`chart-fill-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0.04} />
              </linearGradient>
            );
          })}
        </defs>
        <CommonAxes xKey={xKey} />
        <Tooltip
          contentStyle={tooltipContentStyle()}
          cursor={{ strokeOpacity: 0.4 }}
        />
        {stacked ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => {
          const color = seriesColor(s, i);
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#chart-fill-${s.key})`}
              {...(stacked ? { stackId: "stack" } : {})}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ChartCardShell>
  );
};

// ── PieChartCard ───────────────────────────────────────────────────────────────────────────────
export interface PieChartCardProps extends ChartCardBaseProps {
  /** Feld-Schlüssel des darzustellenden Werts. Default: der `key` der ERSTEN Reihe. */
  valueKey?: string;
}

/**
 * Kreis-/Tortendiagramm — ein Segment je Datensatz, Werte aus `valueKey` (oder erster Reihe), die
 * Kategorie-Beschriftung aus `xKey`. Segmentfarben zyklisch aus den Chart-Tokens.
 */
export const PieChartCard: React.FC<PieChartCardProps> = (props) => {
  const { data, series, xKey, valueKey } = props;
  const firstSeries = series[0];
  const dataKey = valueKey ?? firstSeries?.key ?? "";
  return (
    <ChartCardShell {...props}>
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Tooltip contentStyle={tooltipContentStyle()} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={xKey}
          cx="50%"
          cy="50%"
          outerRadius="80%"
          innerRadius="0%"
          stroke="var(--color-card)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((_row, i) => (
            <Cell key={i} fill={`var(${chartVar(i)})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartCardShell>
  );
};
