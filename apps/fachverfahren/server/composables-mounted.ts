// composables-mounted — die AUTO-MONTAGE der CHOS-EMITTIERTEN Composable-Manifeste (Ziel-1 S8, „CHOS GENERATES").
// Schließt den KIT↔CHOS-Loop: die im Verfahrens-Build erzeugten, adressierbaren Stellen-Manifeste
// (`.chos/mesh/composables/<id>.json`, Schreiber CHOS `mesh-emit.writeComposableManifests`) werden BEIM START zu
// erstklassigen `AgenticComposable` gemountet — statt einer HAND-DEKLARIERTEN Composable-Liste. Die Manifeste sind
// die EINE Wahrheit (aus DEMSELBEN Mesh wie Katalog/Canvas); dieses Modul projiziert sie über den bestehenden
// Mount-Mapper (`mapManifestToComposable`) auf die Laufzeit-Wahrheit dieses Kits — REUSE=MOUNTEN, kein zweites Modell.
//
// EINE-WAHRHEIT-SEAM (daten-only, keine CHOS→KIT-Typ-Kopplung): CHOS schreibt DATEN (Manifest + Verdikt), der KIT
// trägt die Typ-Projektion (Mapper). Die ENUMERATION ist das Verzeichnis selbst (ein Manifest je Datei, `istMeshManifest`
// trennt Nachbardateien) — KEIN Index-Artefakt, das als zweite Aufzählungs-Wahrheit driften könnte.
//
// ANSPRUCH ∧ BELEG (fail-closed): je Manifest wird das daneben liegende Eval-Verdikt (`<id>.cert.json`) STRUKTURELL
// nachgerechnet (verifyMeshCertStructure, Frische gegen die EXAKTEN Manifest-Bytes). Ohne verdienten Beleg kappt der
// Mapper deklariertes certified/active EHRLICH auf `candidate` (kein Über-Claim). Ein über-autonomes/inkongruentes
// Manifest wird vom Mapper geworfen und hier EHRLICH ÜBERSPRUNGEN (kein stilles Kappen der Autonomie).
//
// FALLBACK: fehlt `.chos/mesh/composables/` (Template ohne Build), lädt nichts — der Aufrufer fällt sauber auf die
// hand-deklarierten Muster-Composables zurück. Best-effort/fail-open: ein Lese-/Scan-Fehler wirft NIE nach oben.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  istMeshManifest,
  mapManifestToComposable,
  verifyMeshCertStructure,
  type AgenticComposable,
  type ComposableHerkunft,
  type ComposableHerkunftQuelle,
  type MeshComposableManifest,
} from "@senticor/public-sector-sdk";

const sha256 = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");

const msg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const trimmedString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

/** Die Provenienz-Quellen aus der Mount-Provenienz normalisieren (fail-open: unbrauchbare Einträge fallen weg). */
function normalisiereQuelle(raw: unknown): ComposableHerkunftQuelle[] {
  if (!Array.isArray(raw)) return [];
  const out: ComposableHerkunftQuelle[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object" || Array.isArray(q)) continue;
    const r = q as Record<string, unknown>;
    const verbundId = trimmedString(r["verbundId"]);
    const tenant = trimmedString(r["tenant"]);
    if (!verbundId && !tenant) continue; // ohne jede Zuordnung keine „Quelle" vortäuschen
    const publishedAt = trimmedString(r["publishedAt"]);
    out.push({ verbundId, tenant, ...(publishedAt ? { publishedAt } : {}) });
  }
  return out;
}

/**
 * ladeHerkunft — liest die neben dem Manifest liegende Mount-Provenienz (`<id>.mount.json`, von CHOS
 * `mountComposableDefinition` geschrieben) und projiziert sie auf die typisierte `ComposableHerkunft`. Die
 * Datei ist die EINE Wahrheit des ERP-Reuse: ist sie da (wohlgeformt, kongruent zu DIESER Stelle) ⇒ die Stelle
 * ist aus der geteilten Registry GEMOUNTET; fehlt/malformt/inkongruent ⇒ LOKAL abgeleitet. REIN best-effort:
 * absente/kaputte Provenienz wird NIE geraten und wirft NIE (evidence-driven fail-open, absent = lokal).
 */
function ladeHerkunft(dir: string, id: string): ComposableHerkunft {
  const lokal: ComposableHerkunft = { art: "lokal-abgeleitet" };
  const p = path.join(dir, `${id}.mount.json`);
  if (!existsSync(p)) return lokal;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return lokal; // malformt (kein Objekt) ⇒ lokal
    const m = parsed as Record<string, unknown>;
    // Kongruenz: die Provenienz muss zu DIESER Stelle gehören — ein anderer Bezug ⇒ keine fremde Herkunft raten.
    const belegteId = trimmedString(m["composableId"]);
    if (belegteId && belegteId !== id) return lokal;
    const version = trimmedString(m["version"]);
    const recordHash = trimmedString(m["recordHash"]);
    const mountedAt = trimmedString(m["mountedAt"]);
    return {
      art: "registry-mount",
      quelle: normalisiereQuelle(m["quelle"]),
      ...(version ? { version } : {}),
      ...(recordHash ? { recordHash } : {}),
      ...(mountedAt ? { mountedAt } : {}),
    };
  } catch {
    return lokal; // unlesbar/kein JSON ⇒ lokal (nie werfen)
  }
}

/** Das Verzeichnis der CHOS-emittierten Manifeste — relativ zur Projekt-Wurzel (Laufzeit-CWD der generierten App).
 *  `MOUNTED_COMPOSABLES_DIR` überschreibt (DIESELBE Env-Konvention wie das check:composables-Gate). */
export function resolveMountedComposablesDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.resolve(
    env["MOUNTED_COMPOSABLES_DIR"] ?? path.join(".chos", "mesh", "composables"),
  );
}

export interface MountedLoad {
  /** Die gemounteten, wohlgeformten Composables (Mapper-projiziert, Governance erzwungen). */
  composables: AgenticComposable[];
  /** Übersprungene Dateien mit Grund (fail-closed verworfen: über-autonom/inkongruent/unlesbar) — ehrlich, nie geraten. */
  uebersprungen: { file: string; grund: string }[];
}

/**
 * loadMountedComposables — scannt `dir` nach `<id>.json`-Manifesten, liest je Manifest das daneben liegende
 * `<id>.cert.json` (Attestation via verifyMeshCertStructure) und projiziert über `mapManifestToComposable`.
 * Zusätzlich wird die neben dem Manifest liegende Mount-Provenienz (`<id>.mount.json`) gelesen und als typisierte
 * `herkunft` angehängt (registry-mount = ERP-Reuse aus der geteilten Registry · sonst lokal-abgeleitet).
 * Nachbardateien (`.cert.json`/`.mount.json`/fremd) zählen NICHT als Manifest. Fehlt `dir`, ist das Ergebnis leer
 * (der Aufrufer fällt auf die Muster zurück). REIN best-effort — wirft nie.
 */
export function loadMountedComposables(
  dir: string = resolveMountedComposablesDir(),
): MountedLoad {
  const composables: AgenticComposable[] = [];
  const uebersprungen: { file: string; grund: string }[] = [];
  if (!existsSync(dir)) return { composables, uebersprungen };

  let entries: string[];
  try {
    entries = readdirSync(dir).filter(
      (f) =>
        f.endsWith(".json") &&
        !f.endsWith(".cert.json") &&
        !f.endsWith(".mount.json"),
    );
  } catch (e) {
    // Verzeichnis nicht lesbar → Fallback auf Muster (kein Wurf).
    return { composables, uebersprungen: [{ file: dir, grund: msg(e) }] };
  }

  for (const file of entries.sort()) {
    let raw: Buffer;
    let parsed: unknown;
    try {
      raw = readFileSync(path.join(dir, file));
      parsed = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      uebersprungen.push({ file, grund: `unlesbar/kein JSON: ${msg(e)}` });
      continue;
    }
    if (!istMeshManifest(parsed)) continue; // Nachbardatei (Verdikt/Provenienz/fremd) — kein Manifest
    const manifest = parsed as MeshComposableManifest;
    const id = manifest.id.trim();

    // Attestation aus dem daneben liegenden Verdikt (Frische gegen die EXAKTEN Manifest-Bytes). Fehlt/unlesbar/
    // ungültig ⇒ {valid:false,earned:false} ⇒ der Mapper kappt deklariertes certified/active auf candidate.
    let attestation = { valid: false, earned: false };
    const certPath = path.join(dir, `${id}.cert.json`);
    if (existsSync(certPath)) {
      try {
        const cert = JSON.parse(readFileSync(certPath, "utf8")) as unknown;
        const v = verifyMeshCertStructure(cert, {
          composableId: id,
          manifestSha256: sha256(raw),
        });
        attestation = { valid: v.valid, earned: v.earned };
      } catch {
        /* unlesbares Verdikt → attestation bleibt {false,false} (fail-closed: gekappt) */
      }
    }

    try {
      // Reuse-Herkunft aus der neben dem Manifest liegenden Mount-Provenienz (`<id>.mount.json`) — die EINE
      // Wahrheit des ERP-Reuse. Absent/malformt ⇒ „lokal abgeleitet" (best-effort, nie geraten, nie geworfen).
      const mounted = mapManifestToComposable(manifest, { attestation });
      composables.push({ ...mounted, herkunft: ladeHerkunft(dir, id) });
    } catch (e) {
      // fail-closed reject: ein über-autonomes/inkongruentes Manifest wird EHRLICH verworfen (kein stilles Kappen).
      uebersprungen.push({ file, grund: msg(e) });
    }
  }

  return { composables, uebersprungen };
}
