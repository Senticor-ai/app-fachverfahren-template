/**
 * fachverfahren-kit — Tailwind-Preset (generisch, domänenfrei).
 *
 * Mappt die semantischen Design-Tokens aus styles.css auf Tailwind-Utilities, damit
 * `bg-status-ok`, `text-status-warn-soft`, `border-border`, `bg-surface` usw. in jeder
 * App ohne Wiederholung verfügbar sind. Die konkreten Werte (HSL/oklch, Light/Dark/
 * High-Contrast) liefern weiterhin die CSS-Variablen in styles.css — hier nur die Bindung.
 *
 * Nutzung (tailwind.config.cjs der App):
 *   module.exports = { presets: [require("@senticor/fachverfahren-kit/tailwind-preset.cjs")] };
 *
 * Funktioniert mit Tailwind v3 (presets) und ergänzt das v4-`@theme inline` in styles.css.
 */

/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: ["class"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Auf-/Zuklapp-Animationen für Accordion/Collapsible (Radix gibt die Höhe
      // über --radix-*-content-height vor). Reduced-Motion wird in den Komponenten
      // per `motion-reduce:animate-none` und global in styles.css respektiert.
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "collapsible-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "collapsible-down": "collapsible-down 0.2s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        rail: "var(--rail)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        // Semantische Vorgangs-/Governance-Status (ok/warn/info/block + -soft, neutral)
        status: {
          ok: "var(--status-ok)",
          "ok-soft": "var(--status-ok-soft)",
          warn: "var(--status-warn)",
          "warn-soft": "var(--status-warn-soft)",
          info: "var(--status-info)",
          "info-soft": "var(--status-info-soft)",
          // "neu" = Info-Ton (Antrags-Eingang), semantischer Alias
          neu: "var(--status-info)",
          "neu-soft": "var(--status-info-soft)",
          block: "var(--status-block)",
          "block-soft": "var(--status-block-soft)",
          err: "var(--status-block)",
          "err-soft": "var(--status-block-soft)",
          muted: "var(--status-muted)",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          muted: "var(--sidebar-muted)",
          border: "var(--sidebar-border)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          ring: "var(--ring)",
        },
      },
    },
  },
};
