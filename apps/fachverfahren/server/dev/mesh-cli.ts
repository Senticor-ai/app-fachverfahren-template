// mesh-cli — die AGENTEN-CLI: ein KI-Agent (oder Mensch) steuert das Mesh DIREKT, ohne Browser/Netz/finalen
// Build. Sie bootet appBff in-process gegen die Golden Fixture (mesh-harness) und reicht jedes Kommando ueber
// die ECHTEN Routen (app.inject) durch — RBAC, HITL-Review, Fail-safe und Injektions-Guardrail bleiben EINE
// Wahrheit, die CLI reimplementiert NICHTS. Ausgabe ist JSON (agenten-konsumierbar).
//
// Zwei Modi:
//   1) Einzel-Kommando:   node mesh-cli.js vermerk add case.demo-0001 --text "..." --kind befund
//   2) Batch (stateful):  node mesh-cli.js script --file plan.json   (plan.json = string[][], EIN App-Boot)
// Der Batch-Modus ist der agentische Steuer-Pfad: ein Agent schreibt einen JSON-Plan von Kommandos, die
// STATEFUL gegen dieselbe App laufen (add -> danach sichtbar in list), und erhaelt ein JSON-Transkript.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ResolvedSession } from "@senticor/app-runtime-fastify";
import type { FastifyInstance } from "fastify";
import { buildSeededMeshApp } from "./mesh-harness.js";

export interface MeshCommandResult {
  ok: boolean;
  status: number;
  command: string;
  data: unknown;
}

interface ParsedArgs {
  positionals: string[];
  options: Record<string, string>;
}

function parseArgs(tokens: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (t.startsWith("--")) {
      const name = t.slice(2);
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[name] = next;
        i++;
      } else {
        options[name] = "true";
      }
    } else {
      positionals.push(t);
    }
  }
  return { positionals, options };
}

interface Route {
  method: "GET" | "POST";
  url: string;
  body?: Record<string, unknown>;
}

/** Bildet ein Kommando (Token-Liste) auf eine Route ab. Wirft mit einer klaren Meldung bei Fehlbedienung. */
function routeFor(tokens: string[]): Route {
  const group = tokens[0] ?? "";
  const rest = tokens.slice(1);
  const { positionals, options } = parseArgs(rest);
  const p = (i: number, name: string): string => {
    const v = positionals[i];
    if (v === undefined) throw new Error(`fehlender Parameter: <${name}>`);
    return v;
  };
  const opt = (name: string): string => {
    const v = options[name];
    if (v === undefined) throw new Error(`fehlende Option: --${name}`);
    return v;
  };
  const enc = encodeURIComponent;

  switch (group) {
    case "procedures":
      return { method: "GET", url: "/api/procedures" };
    case "cases":
      return { method: "GET", url: "/api/cases" };
    case "case": {
      const sub = positionals[0] ?? "";
      const id = p(1, "caseId");
      if (sub === "show") return { method: "GET", url: `/api/cases/${enc(id)}` };
      if (sub === "export")
        return { method: "GET", url: `/api/cases/${enc(id)}/vermerke/export` };
      if (sub === "tasks")
        return { method: "GET", url: `/api/cases/${enc(id)}/tasks` };
      throw new Error(`unbekanntes case-Kommando: ${sub} (show|export|tasks)`);
    }
    case "vermerk": {
      const sub = positionals[0] ?? "";
      const id = p(1, "caseId");
      const base = `/api/cases/${enc(id)}/vermerke`;
      if (sub === "list") return { method: "GET", url: base };
      if (sub === "add")
        return {
          method: "POST",
          url: base,
          body: {
            text: opt("text"),
            ...(options["kind"] ? { kind: options["kind"] } : {}),
            ...(options["sichtbarkeit"]
              ? { sichtbarkeit: options["sichtbarkeit"] }
              : {}),
          },
        };
      if (sub === "ki")
        return {
          method: "POST",
          url: `${base}/ki`,
          body: { task: opt("task"), input: {} },
        };
      if (sub === "review") {
        const vermerkId = p(2, "vermerkId");
        return {
          method: "POST",
          url: `${base}/${enc(vermerkId)}/review`,
          body: { entscheidung: opt("entscheidung") },
        };
      }
      throw new Error(
        `unbekanntes vermerk-Kommando: ${sub} (list|add|ki|review)`,
      );
    }
    case "wissen": {
      const sub = positionals[0] ?? "";
      const proc = p(1, "procedureId");
      const ver = p(2, "version");
      const base = `/api/verfahren/${enc(proc)}/${enc(ver)}/wissen`;
      if (sub === "list") return { method: "GET", url: base };
      if (sub === "export") return { method: "GET", url: `${base}/export` };
      if (sub === "add")
        return {
          method: "POST",
          url: base,
          body: {
            text: opt("text"),
            ...(options["kind"] ? { kind: options["kind"] } : {}),
          },
        };
      if (sub === "ki")
        return {
          method: "POST",
          url: `${base}/ki`,
          body: { task: opt("task") },
        };
      if (sub === "review") {
        const eintragId = p(3, "eintragId");
        return {
          method: "POST",
          url: `${base}/${enc(eintragId)}/review`,
          body: { entscheidung: opt("entscheidung") },
        };
      }
      throw new Error(
        `unbekanntes wissen-Kommando: ${sub} (list|export|add|ki|review)`,
      );
    }
    default:
      throw new Error(
        `unbekannte Gruppe: ${group} (procedures|cases|case|vermerk|wissen)`,
      );
  }
}

async function executeOne(
  app: FastifyInstance,
  tokens: string[],
): Promise<MeshCommandResult> {
  const command = tokens.join(" ");
  let route: Route;
  try {
    route = routeFor(tokens);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      command,
      data: { error: error instanceof Error ? error.message : String(error) },
    };
  }
  const res = await app.inject({
    method: route.method,
    url: route.url,
    ...(route.body ? { payload: route.body } : {}),
  });
  const data =
    res.body.length > 0
      ? ((): unknown => {
          try {
            return res.json();
          } catch {
            return res.body;
          }
        })()
      : null;
  return { ok: res.statusCode < 400, status: res.statusCode, command, data };
}

/** Fuehrt eine FOLGE von Kommandos STATEFUL gegen EINE geseedete App aus (add -> danach in list sichtbar).
 *  Kern der Agenten-Steuerung; direkt testbar (kein Prozess/Netz). Schliesst die App am Ende. */
export async function executeMeshCommands(
  commands: string[][],
  opts: { seed?: boolean; session?: ResolvedSession } = {},
): Promise<MeshCommandResult[]> {
  const { app } = await buildSeededMeshApp(opts);
  const results: MeshCommandResult[] = [];
  try {
    for (const tokens of commands) {
      results.push(await executeOne(app, tokens));
    }
  } finally {
    await app.close();
  }
  return results;
}

const USAGE = `mesh — Agenten-CLI fuer das Fachverfahren-Mesh (Golden Fixture, in-process)

  procedures                                  Verfahren auflisten
  cases                                       Faelle auflisten
  case show|export|tasks <caseId>             Akte lesen / Kontext-Export / Aufgaben
  vermerk list <caseId>                       Blackboard lesen
  vermerk add <caseId> --text T [--kind K] [--sichtbarkeit public|private]
  vermerk ki <caseId> --task T                KI-Entwurf (offen, pruefpflichtig)
  vermerk review <caseId> <vermerkId> --entscheidung bestaetigt|verworfen
  wissen list|export <procedureId> <version>  Verfahrens-Wiki lesen / Export
  wissen add <procedureId> <version> --text T [--kind K]
  wissen ki <procedureId> <version> --task T
  wissen review <procedureId> <version> <eintragId> --entscheidung bestaetigt|verworfen
  script --file plan.json                     Batch: JSON string[][], STATEFUL in einem App-Boot

Jedes Kommando startet frisch aus der Golden Fixture; nutze 'script' fuer stateful Folgen.`;

/** CLI-Einstieg: parst argv (Einzel-Kommando ODER 'script --file'), fuehrt aus, liefert Text + Exit-Code. */
export async function runMeshCommand(
  argv: string[],
  opts: { session?: ResolvedSession } = {},
): Promise<{ exitCode: number; text: string; results: MeshCommandResult[] }> {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    return { exitCode: 0, text: USAGE, results: [] };
  }
  let commands: string[][];
  if (argv[0] === "script") {
    const { options } = parseArgs(argv.slice(1));
    const file = options["file"];
    if (file === undefined) {
      return { exitCode: 2, text: "fehlende Option: --file", results: [] };
    }
    try {
      const raw = await readFile(file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (
        !Array.isArray(parsed) ||
        !parsed.every(
          (c) => Array.isArray(c) && c.every((t) => typeof t === "string"),
        )
      ) {
        return {
          exitCode: 2,
          text: "plan muss string[][] sein (Array von Kommando-Token-Arrays)",
          results: [],
        };
      }
      commands = parsed as string[][];
    } catch (error) {
      return {
        exitCode: 2,
        text: `plan nicht lesbar: ${error instanceof Error ? error.message : String(error)}`,
        results: [],
      };
    }
  } else {
    commands = [argv];
  }
  const results = await executeMeshCommands(commands, opts);
  const exitCode = results.every((r) => r.ok) ? 0 : 1;
  return { exitCode, text: JSON.stringify(results, null, 2), results };
}

async function main(): Promise<void> {
  const { exitCode, text } = await runMeshCommand(process.argv.slice(2));
  process.stdout.write(text + "\n");
  process.exit(exitCode);
}

// Nur ausfuehren, wenn direkt gestartet (nicht beim Import aus dem Test).
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  void main();
}
