#!/usr/bin/env node
// check-contrast-tokens — haelt die semantischen Text-auf-Flaeche-Token-Paare im Design-System auf
// WCAG-2.1-AA-Kontrast (>= 4.5:1 fuer Fliesstext, BITV 2.0). Root-Cause-Waechter: der Warn-Text-Token
// war auf der Warn-Soft-Flaeche bei nur 3.99:1 (unter AA) — genau diese Klasse von Regression (ein
// Status-Ton-Text, der auf seiner Soft-Flaeche unter den Schwellwert rutscht) faengt dieses Gate ab,
// bevor sie in die UI gelangt. Rein statisch (keine Browser/axe): parst die CSS-Custom-Properties,
// rechnet den WCAG-Kontrast und prueft eine EXPLIZITE Liste von Paaren, die als Text-auf-Flaeche
// gedacht sind. Generisch: neue Toene -> Paar ergaenzen; kein Domaenen-Wissen.
//
// Deckt hsl()- und Hex-Leaf-Werte (die Status-Familie ist hsl). oklch()-/var()-nur-Werte, die sich
// nicht zu hsl/hex aufloesen lassen, werden mit Hinweis uebersprungen (kein False-Fail) — der Kern
// (Status-Text/Soft) bleibt hart geprueft.
import { readFileSync, existsSync } from "node:fs";

const CSS = "packages/fachverfahren-kit/src/styles.css";
const MIN_AA = 4.5; // WCAG 2.1 AA, normaler Text

if (!existsSync(CSS)) {
  console.error(`contrast-tokens: ${CSS} fehlt`);
  process.exit(1);
}
const text = readFileSync(CSS, "utf8");

// --- Token-Karte (Licht-Theme = ERSTE Definition je Name; die Dark-Overrides folgen im File danach) ---
const tokens = new Map();
for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  const name = m[1].trim();
  if (!tokens.has(name)) tokens.set(name, m[2].trim()); // nur die erste (Licht-)Definition
}

function resolve(value, tiefe = 0) {
  if (tiefe > 8) return null;
  const v = value.trim();
  const varM = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i);
  if (varM) {
    const ref = tokens.get(varM[1]);
    return ref ? resolve(ref, tiefe + 1) : null;
  }
  return v;
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Liefert [r,g,b] 0..255 oder null (nicht parsebar -> Paar wird uebersprungen).
function toRgb(raw) {
  const v = resolve(raw);
  if (!v) return null;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const hsl = v.match(
    /^hsl\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*\)$/i,
  );
  if (hsl) return hslToRgb(+hsl[1], +hsl[2], +hsl[3]);
  return null; // oklch() o.ae. -> ueberspringen
}

function relLum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const l1 = relLum(a),
    l2 = relLum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --- EXPLIZITE Text-auf-Flaeche-Paare (die Vertragsflaechen des Design-Systems) ---
const PAARE = [
  ["--status-ok", "--status-ok-soft", "Status OK — Text auf Soft"],
  ["--status-warn", "--status-warn-soft", "Status Warn — Text auf Soft"],
  ["--status-block", "--status-block-soft", "Status Block — Text auf Soft"],
  ["--status-info", "--status-info-soft", "Status Info — Text auf Soft"],
  ["--foreground", "--background", "Vordergrund auf Hintergrund"],
  ["--card-foreground", "--card", "Card-Text auf Card"],
  ["--muted-foreground", "--background", "Muted-Text auf Hintergrund"],
  ["--primary-foreground", "--primary", "Primary-Label auf Primary"],
];

const fehler = [];
const uebersprungen = [];
console.log(`contrast-tokens — WCAG 2.1 AA (>= ${MIN_AA}:1), Licht-Theme:`);
for (const [fgName, bgName, label] of PAARE) {
  const fgRaw = tokens.get(fgName),
    bgRaw = tokens.get(bgName);
  if (!fgRaw || !bgRaw) {
    uebersprungen.push(`${label}: Token fehlt (${fgName}/${bgName})`);
    continue;
  }
  const fg = toRgb(fgRaw),
    bg = toRgb(bgRaw);
  if (!fg || !bg) {
    uebersprungen.push(
      `${label}: nicht parsebar (oklch/var) — ${fgName}/${bgName}`,
    );
    continue;
  }
  const ratio = contrast(fg, bg);
  const ok = ratio >= MIN_AA;
  console.log(
    `  ${ok ? "OK " : "!! "} ${ratio.toFixed(2)}:1  ${label}  (${fgName} auf ${bgName})`,
  );
  if (!ok)
    fehler.push(
      `${label}: nur ${ratio.toFixed(2)}:1 (< ${MIN_AA}:1) — ${fgName} auf ${bgName}`,
    );
}
for (const u of uebersprungen) console.log(`  -- uebersprungen: ${u}`);

if (fehler.length > 0) {
  console.error("\ncontrast-tokens verletzt (WCAG 2.1 AA / BITV 2.0):");
  for (const f of fehler) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `\ncontrast-tokens ok — ${PAARE.length - uebersprungen.length} Paare >= ${MIN_AA}:1${uebersprungen.length ? `, ${uebersprungen.length} uebersprungen` : ""}.`,
);
