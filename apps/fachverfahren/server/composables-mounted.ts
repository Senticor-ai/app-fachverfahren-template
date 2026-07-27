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
import {
  createHash,
  createPublicKey,
  verify as ed25519Verify,
} from "node:crypto";
import {
  ARCHETYPEN,
  archetypBruch,
  type Archetyp,
} from "@senticor/public-sector-sdk";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  istMeshManifest,
  mapManifestToComposable,
  verifyMeshCertStructure,
  verifyMeshGovernanceProjektion,
  type AgenticComposable,
  type ComposableHerkunft,
  type ComposableHerkunftQuelle,
  type MeshComposableManifest,
} from "@senticor/public-sector-sdk";

const sha256 = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");

/** node:crypto-Primitive für den PURE-Package-Injektions-Seam (die Sicherheits-Logik lebt in verifyMeshCertStructure). */
const sha256Hex = (s: string): string =>
  createHash("sha256").update(s).digest("hex");
const verifyEd25519 = (
  publicKey: string,
  domain: string,
  digestHex: string,
  signature: string | undefined,
): boolean => {
  if (!signature || typeof publicKey !== "string") return false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(publicKey, "base64url"),
      format: "der",
      type: "spki",
    });
    if (pub.asymmetricKeyType !== "ed25519") return false;
    return ed25519Verify(
      null,
      Buffer.from(`${domain}\0${digestHex}`, "utf8"),
      pub,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
};

/** Well-known Dateiname des vertrauten ÖFFENTLICHEN Cert-Signing-Keys (Spiegel CHOS COMPOSABLE_CERT_PUBKEY_FILE). */
const CERT_PUBKEY_FILE = "cert-signing-key.pub";

/** Löst den VERTRAUTEN Cert-Signing-Public-Key auf: ENV CHOS_CERT_SIGNING_PUBKEY → sonst die well-known Datei
 *  `cert-signing-key.pub` neben den Verdikten. Fehlt beides ⇒ null (Signatur ungeprüft ⇒ certified fail-closed gekappt). */
function trustedCertKey(dir: string): string | null {
  const env = process.env["CHOS_CERT_SIGNING_PUBKEY"];
  if (env && env.trim()) return env.trim();
  try {
    const s = readFileSync(path.join(dir, CERT_PUBKEY_FILE), "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

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

/** Relativer Pfad des Manifest-Verzeichnisses unter der Projekt-Wurzel — EINE Schreibweise für Auflösung + Tests. */
export const MOUNTED_COMPOSABLES_REL = path.join(
  ".chos",
  "mesh",
  "composables",
);

/**
 * resolveProjectRoot — findet die Projekt-Wurzel AUFWÄRTS statt sie aus dem Prozess-CWD zu raten.
 *
 * WARUM (E4): die Manifeste liegen in der WURZEL des Workspace, der Server startet aber je nach Aufruf mit einem
 * anderen CWD — `node apps/fachverfahren/dist-server/index.js` aus `/app` (Container) gegen
 * `pnpm --filter … start` aus `apps/fachverfahren` (lokal). Im zweiten Fall zeigte `path.resolve(".chos/…")` auf
 * ein Verzeichnis, das es dort nie gibt: der Mount lief STILL leer und die App fiel auf ihre Muster-Composables
 * zurück — ohne einen einzigen Hinweis, dass die Stellen des Verfahrens fehlen.
 *
 * Reihenfolge: `APP_PROJECT_ROOT` (explizit) → erstes Verzeichnis aufwärts, das `.chos/mesh/composables` trägt →
 * erstes Verzeichnis aufwärts mit `pnpm-workspace.yaml` → CWD (heutiges Verhalten als letzter Fallback).
 */
export function resolveProjectRoot(
  startDir: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explizit = env["APP_PROJECT_ROOT"]?.trim();
  if (explizit) return path.resolve(explizit);
  const kandidaten: string[] = [];
  let cur = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    kandidaten.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const mitManifesten = kandidaten.find((d) =>
    existsSync(path.join(d, MOUNTED_COMPOSABLES_REL)),
  );
  if (mitManifesten) return mitManifesten;
  const mitWorkspace = kandidaten.find((d) =>
    existsSync(path.join(d, "pnpm-workspace.yaml")),
  );
  return mitWorkspace ?? path.resolve(startDir);
}

/** Das Verzeichnis der CHOS-emittierten Manifeste — aufgelöst aus der PROJEKT-WURZEL, nicht aus dem Prozess-CWD.
 *  `MOUNTED_COMPOSABLES_DIR` überschreibt (DIESELBE Env-Konvention wie das check:composables-Gate). */
export function resolveMountedComposablesDir(
  env: NodeJS.ProcessEnv = process.env,
  startDir: string = process.cwd(),
): string {
  const override = env["MOUNTED_COMPOSABLES_DIR"];
  if (override) return path.resolve(override);
  return path.join(resolveProjectRoot(startDir, env), MOUNTED_COMPOSABLES_REL);
}

export interface MountedLoad {
  /** Die gemounteten, wohlgeformten Composables (Mapper-projiziert, Governance erzwungen). */
  composables: AgenticComposable[];
  /** Übersprungene Dateien mit Grund (fail-closed verworfen: über-autonom/inkongruent/unlesbar) — ehrlich, nie geraten. */
  uebersprungen: { file: string; grund: string }[];
  /** Stellen, deren Befugnis ihrem ARCHETYP widerspricht — der häufigste Schnitt-Fehler.
   *
   *  Ein Initiator, der Bescheide erlässt, ist kein Initiator mehr; eine rechtsnahe Stelle ohne HITL-Pflicht
   *  ist ein Governance-Loch. BEWUSST kein Wurf: ein Bruch darf eine laufende Anwendung nicht abschalten —
   *  er wird BENANNT, und ob er blockt, entscheidet die Verfassung. Leer, solange alles zum Archetyp passt. */
  archetypBrueche: { id: string; bruch: string }[];
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
  /** Stellen, deren Befugnis ihrem Archetyp widerspricht — sichtbar, nicht blockend. */
  const archetypBrueche: { id: string; bruch: string }[] = [];
  if (!existsSync(dir))
    return { composables, uebersprungen, archetypBrueche: [] };

  const trusted = trustedCertKey(dir);

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
    return {
      composables,
      uebersprungen: [{ file: dir, grund: msg(e) }],
      archetypBrueche: [],
    };
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

    // ── DIE MITGEREISTE VERFASSUNG (Verteilzeit): das Siegel wird NACHGERECHNET, nicht geglaubt. ──────────────
    // Verlässt eine Stelle ihren Arbeitsbereich, ist die eigene Verfassung dieses Trägers über sie stumm — die
    // mitgereiste, versiegelte Projektion IST hier ihre Verfassung. Genau deshalb darf sie nicht unterwegs
    // veränderbar sein: ein gebrochenes Siegel bedeutet, dass jemand die Governance einer fremden Stelle
    // umgeschrieben hat. Das ist kein Kappungs-Fall, sondern ein Übersprung-Fall (fail-closed, sichtbar).
    // ABSENZ blockt NICHT: eine Stelle ohne Projektion behauptet über Governance ehrlich nichts (Alt-Bestand) —
    // sie darauf zu blocken wäre ein Falsch-Blocker, der jeden Mount ohne CHOS-Governance unmöglich machte.
    const gov = verifyMeshGovernanceProjektion(manifest.governanceProjektion, {
      composableId: id,
      sha256Hex,
    });
    if (gov.vorhanden && !gov.intakt) {
      uebersprungen.push({ file, grund: gov.gruende.join(" · ") });
      continue;
    }

    // Attestation aus dem daneben liegenden Verdikt (Frische gegen die EXAKTEN Manifest-Bytes + Ed25519-Signatur gegen
    // den vertrauten PUBLIC Key). Fehlt/unlesbar/ungültig/unsigniert ⇒ earned:false ⇒ der Mapper kappt deklariertes
    // certified/active fail-closed auf candidate (kein Über-Claim ohne verdienten UND authentischen Beleg).
    let attestation = { valid: false, earned: false };
    const certPath = path.join(dir, `${id}.cert.json`);
    if (existsSync(certPath)) {
      try {
        const cert = JSON.parse(readFileSync(certPath, "utf8")) as unknown;
        const v = verifyMeshCertStructure(cert, {
          composableId: id,
          manifestSha256: sha256(raw),
          certSigningPublicKey: trusted,
          sha256Hex,
          verifyEd25519,
          // Das Verdikt bezeugt ein ZWEITES Subjekt `<id>#governance`. Bisher prüfte der KIT nur subject[0] — ein
          // Verdikt konnte also „zertifiziert" sagen, während die Governance darunter ausgetauscht war. Jetzt wird
          // der nachgerechnete Projektions-Digest dagegen gehalten: `null` = keine (gültige) Projektion vorhanden.
          governanceSha256: gov.intakt && gov.digest ? gov.digest : null,
        });
        // earned NUR mit verifizierter Signatur (fehlt der vertraute Key ⇒ signatureChecked=false ⇒ gekappt).
        attestation = {
          valid: v.valid,
          earned: v.earned && v.signatureChecked,
        };
      } catch {
        /* unlesbares Verdikt → attestation bleibt {false,false} (fail-closed: gekappt) */
      }
    }

    try {
      // Reuse-Herkunft aus der neben dem Manifest liegenden Mount-Provenienz (`<id>.mount.json`) — die EINE
      // Wahrheit des ERP-Reuse. Absent/malformt ⇒ „lokal abgeleitet" (best-effort, nie geraten, nie geworfen).
      // DIE VERSIEGELTE VERFASSUNG WIRD DURCHGEREICHT, nicht bloss geprueft: aus IHR nimmt der Mapper die
      // strukturierte Faehigkeits-Seite. Ohne diese Zeile waere das Feld vorgesehen, typisiert und nie gefuellt —
      // die Defektklasse, die diese Woche siebenmal aufgefallen ist. `gov` ist an dieser Stelle bereits
      // nachgerechnet: ein gebrochenes Siegel hat den Mount weiter oben uebersprungen.
      const mounted = mapManifestToComposable(manifest, { attestation, governance: gov });
      composables.push({ ...mounted, herkunft: ladeHerkunft(dir, id) });
      // ARCHETYP-BRUCH sichtbar machen (nicht werfen): traegt die Stelle eine Befugnis, die ihr Archetyp
      // ausschliesst? Der haeufigste Schnitt-Fehler — ein Initiator, der Bescheide erlaesst, ist kein
      // Initiator mehr; eine rechtsnahe Stelle ohne HITL-Pflicht ist ein Governance-Loch.
      // BEWUSST KEIN WURF: ein Bruch darf eine laufende Anwendung nicht abschalten. Er wird BENANNT; ob er
      // blockt, entscheidet die Verfassung — dieselbe Trennung wie bei jedem anderen Befund dieses Kits.
      const archetyp = archetypVonId(id);
      if (archetyp) {
        for (const bruch of archetypBruch(manifest, archetyp))
          archetypBrueche.push({ id, bruch });
      }
    } catch (e) {
      // fail-closed reject: ein über-autonomes/inkongruentes Manifest wird EHRLICH verworfen (kein stilles Kappen).
      uebersprungen.push({ file, grund: msg(e) });
    }
  }

  return { composables, uebersprungen, archetypBrueche };
}

/** Der Archetyp hinter einer Stellen-Kennung — `null`, wenn die Stelle keinem der drei entspricht (voellig
 *  legitim: ein Verfahren darf eigene Struktur-Stellen fuehren, fuer die kein Archetyp gilt). */
function archetypVonId(id: string): Archetyp | null {
  for (const [name, profil] of Object.entries(ARCHETYPEN))
    if (profil.id === id) return name as Archetyp;
  return null;
}
