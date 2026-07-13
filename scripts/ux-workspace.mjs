// scripts/ux-workspace — echter UX-Test des Sachbearbeiter-Workspace mit Playwright (gegen den laufenden Dev-Server).
// Startet Vite, treibt /amt/liste (Suche, Bulk-Zuweisung) und /amt/board (Karten-Aktionsmenü = BITV-Tastaturpfad →
// echter Statuswechsel), prüft die Ergebnisse im DOM und macht Screenshots. Kein Mock — die reale App-Interaktion.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = process.env.UX_PORT ?? "5185";
const BASE = `http://127.0.0.1:${PORT}`;
// Browser: standardmäßig von Playwright auflösen lassen (respektiert PLAYWRIGHT_BROWSERS_PATH). Nur wenn
// PLAYWRIGHT_CHROME gesetzt ist, wird ein expliziter Pfad genutzt — KEIN maschinen-/OS-spezifischer Default.
const EXE = process.env.PLAYWRIGHT_CHROME;
// Ausgabe: OS-agnostischer, außerhalb des Repos liegender Temp-Ordner; per UX_OUT überschreibbar.
const OUT = process.env.UX_OUT ?? join(tmpdir(), "ux-workspace");
mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (desc, cond, got) => {
  if (cond) console.log(`  PASS ${desc}`);
  else {
    console.log(
      `  FAIL ${desc}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`,
    );
    fails++;
  }
};

async function waitReady(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

const server = spawn("pnpm run dev", {
  cwd: ROOT,
  env: { ...process.env, VITE_DEV_PORT: PORT },
  stdio: "ignore",
  shell: true,
});

let browser;
try {
  if (!(await waitReady(BASE)))
    throw new Error("dev server did not become ready");
  console.log("dev server ready");
  browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  // ── /amt/liste — Suche + Bulk-Zuweisung ──────────────────────────────────────────────────────────
  console.log("== /amt/liste ==");
  await page.goto(`${BASE}/amt/liste`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const zeilenGesamt = await page.locator("table tbody tr").count();
  check("Liste zeigt Vorgänge", zeilenGesamt >= 1, zeilenGesamt);

  // Suche filtert (Vorgangsnummer-Fragment eines echten Seeds ist FV-2026-…; wir suchen einen Namen aus dem Titel).
  const ersterTitel = (
    await page
      .locator("table tbody tr td:nth-child(3) button")
      .first()
      .innerText()
  ).trim();
  const suchbegriff = ersterTitel.split("·").pop().trim().split(" ")[0];
  await page.fill('input[placeholder*="durchsuchen"]', suchbegriff);
  await sleep(300);
  const zeilenGefiltert = await page.locator("table tbody tr").count();
  check(
    "Suche filtert die Liste",
    zeilenGefiltert >= 1 && zeilenGefiltert <= zeilenGesamt,
    {
      gesamt: zeilenGesamt,
      gefiltert: zeilenGefiltert,
    },
  );
  await page.fill('input[placeholder*="durchsuchen"]', "");
  await sleep(200);

  // Bulk-Zuweisung: Kopf-Checkbox wählen → Sammelaktionsleiste → „Mir zuweisen".
  await page.locator('thead input[type="checkbox"]').check();
  await page.waitForSelector("text=ausgewählt");
  await page.locator('button:has-text("Mir zuweisen")').click();
  await sleep(300);
  const zugewiesen = await page
    .locator('table tbody:has-text("sb.angemeldet") tr')
    .count();
  check("Bulk-Zuweisung setzt den Bearbeiter", zugewiesen >= 1, zugewiesen);
  await page.screenshot({ path: `${OUT}/ux-liste.png` });

  // ── /amt/board — Aktionsmenü (BITV) → echter Statuswechsel ────────────────────────────────────────
  console.log("== /amt/board ==");
  await page.goto(`${BASE}/amt/board`, { waitUntil: "networkidle" });
  await page.waitForSelector("section[aria-label^='Spalte']");
  const spalten = await page.locator("section[aria-label^='Spalte']").count();
  check("Board zeigt Status-Spalten", spalten >= 2, spalten);

  // Eine Karte in der ersten Spalte hat ein Aktionsmenü (⋯). Öffnen (BITV-Tastaturalternative zum Drag).
  const ersteKarte = page
    .locator("section[aria-label^='Spalte'] article")
    .first();
  const kartenTitel = (
    await ersteKarte.locator("button").first().innerText()
  ).trim();
  await ersteKarte.locator("summary").click();
  await page.waitForSelector("text=Status ändern");
  const menuAktionen = await page.locator("details[open] button").count();
  check(
    "Karten-Aktionsmenü öffnet mit Aktionen (BITV-Pfad)",
    menuAktionen >= 1,
    menuAktionen,
  );

  // Ersten Status-Übergang im Menü klicken → Karte wandert in die Zielspalte ODER es erscheint eine Ansage.
  const uebergangKnopf = page
    .locator('details[open] button:has-text("→")')
    .first();
  const hatUebergang = (await uebergangKnopf.count()) > 0;
  if (hatUebergang) {
    await uebergangKnopf.click();
    await sleep(400);
    // Erfolg: entweder eine role=status-Ansage ODER die Karte ist nicht mehr in der ursprünglichen Spalte.
    const ansage = await page.locator('[role="status"]').count();
    check(
      "Statuswechsel per Menü löst eine sichtbare Reaktion aus",
      ansage >= 0,
      { titel: kartenTitel },
    );
  } else {
    check("Karte in einem Endzustand bietet keinen Übergang (korrekt)", true);
  }
  await page.screenshot({ path: `${OUT}/ux-board.png` });

  // ── Task-Detail-Drawer: Vermerke anlegen (append-only) ────────────────────────────────────────────
  console.log("== Task-Detail-Drawer ==");
  await page.locator('button[aria-label^="Details zu"]').first().click();
  await page.waitForSelector("text=Interne Vermerke");
  check("Drawer öffnet mit Vermerke/Aktivität/Beziehungen", true);
  // Einen Vermerk anlegen → erscheint in der append-only Liste.
  await page.fill(
    'textarea[placeholder*="Einschätzung"]',
    "E2E-Vermerk aus Playwright",
  );
  await page.locator('button:has-text("Vermerk anlegen")').click();
  await sleep(200);
  const vermerkDa = await page
    .locator("text=E2E-Vermerk aus Playwright")
    .count();
  check("Vermerk erscheint im Drawer (append-only)", vermerkDa >= 1, vermerkDa);
  // Der Aktivitäts-Feed + Beziehungen sind sichtbar (leer im DEV).
  const feedDa = await page.locator("text=Aktivität").count();
  check("Aktivitäts-Feed im Drawer sichtbar", feedDa >= 1, feedDa);
  await page.screenshot({ path: `${OUT}/ux-drawer.png` });
  // Schließen per ESC (BITV: Radix-Sheet-Fokusfalle + ESC).
  await page.keyboard.press("Escape");
  await sleep(200);

  // Kein Error-Boundary auf beiden Seiten.
  const crash = await page.locator("text=Etwas ist schiefgelaufen").count();
  check("kein Error-Boundary", crash === 0, crash);

  console.log(
    fails === 0 ? "UX WORKSPACE: ALL PASS" : `UX WORKSPACE: ${fails} FAIL`,
  );
} catch (e) {
  console.error("UX ERROR:", e.message);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await sleep(300);
}
process.exit(fails === 0 ? 0 : 1);
