#!/usr/bin/env node
// check-schema-invariants — strukturelles Gate fuer die nicht verhandelbaren Store-Invarianten des Multi-Tenant-/
// Behoerden-Modells, BEVOR (Dual-Mode Phase 1c) die Dossier-Query-/Mutations-Flaeche oeffnet:
//   (1) jede mandanten-/akten-scoped Tabelle traegt `tenant_id text NOT NULL` — sonst leakt ein vergessenes
//       tenant-Praedikat mandantenuebergreifend; die Kern-Fall-/Aufgaben-Tabellen zusaetzlich `authority_id NOT NULL`.
//   (2) jede append-only-Tabelle traegt ihren harten no_mutation-Riegel (BEFORE UPDATE OR DELETE-Trigger + REVOKE) —
//       Struktur statt Konvention.
// Schliesst das check:migration-coverage-Loch (das nur die EXISTENZ eines migration-Felds prueft). Rein statisch ueber
// die committeten Migrationen (SQL-Textscan), kein DB-Zugriff. Neue scoped/append-only-Tabelle -> in die Listen unten
// aufnehmen (die "strukturelle Absicht" explizit + auditierbar).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = execFileSync(
  "git",
  ["ls-files", "packages/app-store-postgres/migrations"],
  {
    encoding: "utf8",
  },
)
  .split("\n")
  .filter((f) => f.endsWith("migration.sql"));
const sql = files.map((f) => readFileSync(f, "utf8")).join("\n\n");

// CREATE TABLE-Bloecke extrahieren (Tabellenname -> Rumpf bis zum schliessenden ");").
const bloecke = new Map();
for (const m of sql.matchAll(
  /CREATE TABLE (?:IF NOT EXISTS )?(app_\w+)\s*\(([\s\S]*?)\n\s*\);/g,
)) {
  bloecke.set(m[1], m[2]);
}

// Mandanten-/akten-scoped Tabellen: MUESSEN tenant_id NOT NULL tragen (Cross-Tenant-Leak-Riegel).
const TENANT_SCOPED = [
  "app_cases",
  "app_tasks",
  "app_intake_items",
  "app_task_comments",
  "app_task_activity",
  "app_saved_views",
  "app_task_relations",
];
// Kern-Fall-/Aufgaben-Tabellen: zusaetzlich authority_id NOT NULL (Sub-Protokoll-Tabellen duerfen legacy-nullbar sein).
const AUTHORITY_NOT_NULL = ["app_cases", "app_tasks"];
// Append-only-Tabellen: MUESSEN den no_mutation-Riegel (Trigger) + REVOKE tragen.
const APPEND_ONLY = [
  "app_audit_events",
  "app_task_comments",
  "app_task_activity",
];

const fehler = [];
const spalteNotNull = (body, spalte) =>
  new RegExp(`\\b${spalte}\\s+text\\s+NOT NULL`, "i").test(body ?? "");

for (const t of TENANT_SCOPED) {
  const body = bloecke.get(t);
  if (body === undefined) {
    fehler.push(`${t}: keine CREATE TABLE gefunden (scoped-Tabelle erwartet)`);
    continue;
  }
  if (!spalteNotNull(body, "tenant_id"))
    fehler.push(
      `${t}: "tenant_id text NOT NULL" fehlt — Mandanten-Leak-Risiko`,
    );
}
for (const t of AUTHORITY_NOT_NULL) {
  const body = bloecke.get(t);
  if (body !== undefined && !spalteNotNull(body, "authority_id"))
    fehler.push(`${t}: "authority_id text NOT NULL" fehlt (Kern-Tabelle)`);
}
for (const t of APPEND_ONLY) {
  const hatTrigger = new RegExp(`BEFORE UPDATE OR DELETE ON ${t}\\b`, "i").test(
    sql,
  );
  // Ein REVOKE, das die Tabelle adressiert (Privilegien-Liste beliebig: "UPDATE, DELETE" oder "UPDATE, DELETE, TRUNCATE").
  const hatRevoke = new RegExp(`REVOKE[^;]*\\bON ${t}\\b`, "i").test(sql);
  if (!hatTrigger || !hatRevoke)
    fehler.push(
      `${t}: append-only-Riegel unvollstaendig (${hatTrigger ? "" : "no_mutation-Trigger fehlt "}${hatRevoke ? "" : "REVOKE fehlt"})`,
    );
}

if (fehler.length > 0) {
  console.error("Schema-Invarianten verletzt:");
  for (const f of fehler) console.error(`  ${f}`);
  console.error(
    "\nJede akten-/fall-scoped Tabelle MUSS tenant_id NOT NULL tragen; append-only-Tabellen ihren no_mutation-Riegel.",
  );
  process.exit(1);
}
console.log(
  `schema-invariants ok — ${TENANT_SCOPED.length} scoped-Tabellen (tenant_id NOT NULL), ${APPEND_ONLY.length} append-only-Riegel geprueft.`,
);
