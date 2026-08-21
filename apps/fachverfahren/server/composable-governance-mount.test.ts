// composable-governance-mount.test — DIE VERTEILZEIT: was passiert, wenn eine zuständige Stelle aus einem fremden
// Verfahren in DIESEN Träger gemountet wird.
//
// Zwei Wächter werden hier bewiesen — und beide schließen einen NACHGERECHNETEN Defekt, nicht einen vermuteten:
//
//   ① MOUNT: die mitgereiste, versiegelte Verfassung wird NACHGERECHNET, nicht geglaubt. Bisher fiel
//      `governanceProjektion` in die Index-Signatur des Manifest-Typs und war dem Träger schlicht UNBEKANNT: die
//      Governance einer fremden Stelle konnte unterwegs umgeschrieben werden, ohne dass hier irgendetwas auffiel.
//      Ebenso wurde vom Verdikt nur `subject[0]` geprüft — das ZWEITE Subjekt `<id>#governance` (das bezeugt,
//      unter WELCHER Verfassung zertifiziert wurde) war ungeprüft.
//
//   ② AUFRUF: `befugnis` war dem Träger ebenfalls unbekannt. Ein Bescheid-Composable mit
//      `{entscheidung:"erlaesst-va", hitlPflicht:true}` und lauter `verbindlich`-Regeln sah damit NICHT rechtsnah
//      aus — und lief als AAL-3-Agent gegen eine Stelle, bei der ein Mensch entscheidet. Der Fix nimmt die
//      BEFUGNIS als Achse (nicht nur die Regel-Klasse) und DECKELT auf AAL-2 „Advise", statt die Stelle zu
//      verwerfen (das wäre ein Falsch-Blocker: das Haupt-Composable verschwände aus der App).
//
// Jede Zusicherung hat ihre GEGENPROBE (Schutz weg ⇒ Aussage fällt) und ihre ÜBERBLOCKUNGS-Probe (der legitime
// Normalfall kommt durch).
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mapManifestToComposable,
  manifestSpineAufgaben,
  mapManifestWithProvenance,
  COMPOSABLE_CERT_PREDICATE_TYPE,
  IN_TOTO_STATEMENT_TYPE,
  MESH_GOVERNANCE_PROJEKTION_SCHEMA_VERSION,
  meshCertGovernanceSubject,
  stableStringify,
  verifyMeshCertStructure,
  verifyMeshGovernanceProjektion,
  type MeshCertFile,
  type MeshComposableManifest,
  type MeshGovernanceProjektion,
} from "@senticor/public-sector-sdk";

const sha256Hex = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

const ID = "sachbearbeitung";

/** Eine versiegelte Projektion, wie CHOS sie erzeugt — das Siegel wird hier ECHT gerechnet (kein Fake-Digest). */
function projektion(
  overrides: Partial<MeshGovernanceProjektion> = {},
): MeshGovernanceProjektion {
  const ohneSiegel: MeshGovernanceProjektion = {
    schemaVersion: MESH_GOVERNANCE_PROJEKTION_SCHEMA_VERSION,
    art: "projektion",
    composableId: ID,
    domain: "musterverfahren",
    regime: { normativ: true },
    stellen: [
      { id: ID, art: "flaeche", zone: "sachbearbeitung", akteur: "beide" },
    ],
    regeln: [
      {
        id: "vier-augen-bescheid",
        label: "Vier-Augen vor Bescheid",
        art: "verbindlich",
        class: "blocking",
        verify: "code",
      },
    ],
    befugnis: { entscheidung: "erlaesst-va", hitlPflicht: true, aal: 3 },
    herkunft: { verfassungDigest: "a".repeat(64), revision: 4711 },
    ...overrides,
  };
  delete (ohneSiegel as Record<string, unknown>)["digest"];
  return { ...ohneSiegel, digest: sha256Hex(stableStringify(ohneSiegel)) };
}

/** Ein Bescheid-Manifest: HITL-pflichtige VA-Stelle mit AAL-3 und AUSSCHLIESSLICH verbindlichen Regeln —
 *  genau die Konstellation, die den Live-Defekt trug. */
function manifest(
  overrides: Partial<MeshComposableManifest> = {},
): MeshComposableManifest {
  return {
    schemaVersion: 1,
    domain: "musterverfahren",
    id: ID,
    titel: "Sachbearbeitung",
    art: "flaeche",
    akteur: "beide",
    governance: {
      regeln: [
        {
          id: "vier-augen-bescheid",
          label: "Vier-Augen vor Bescheid",
          art: "verbindlich",
        },
      ],
    },
    faehigkeiten: { ki: ["antrag_pruefen"], autonomie: "AAL-3" },
    befugnis: { entscheidung: "erlaesst-va", hitlPflicht: true, aal: 3 },
    ...overrides,
  };
}

describe("② AUFRUF — die Befugnis ist die Achse, nicht die Regel-Klasse", () => {
  it("eine HITL-pflichtige Bescheid-Stelle ist rechtsnah, auch wenn ALLE ihre Regeln `verbindlich` sind", () => {
    expect(manifestSpineAufgaben(manifest())).toContain("pruefung");
  });

  it("GEGENPROBE: ohne den befugnis-Block (der alte Zustand) sähe genau dieselbe Stelle NICHT rechtsnah aus", () => {
    const ohneBefugnis = manifest();
    delete ohneBefugnis.befugnis;
    expect(manifestSpineAufgaben(ohneBefugnis)).not.toContain("pruefung");
    // …und liefe damit unverändert auf ihrer deklarierten AAL-3-Decke — der nachgerechnete Live-Defekt.
    expect(mapManifestToComposable(ohneBefugnis).spine?.autonomy).toBe("AAL-3");
  });

  it("die Autonomie wird auf AAL-2 „Advise“ GEDECKELT (nicht die Stelle verworfen)", () => {
    const c = mapManifestToComposable(manifest());
    expect(c.spine?.autonomy).toBe("AAL-2");
    expect(c.spine?.aufgaben).toContain("pruefung");
    // Der nichtScope sagt es dem Fachbereich in Klartext.
    expect(c.outcome.nichtScope.join(" ")).toContain(
      "autonome rechtsnahe Entscheidung",
    );
  });

  it("die Kappung ist SICHTBAR (Provenienz), nicht still", () => {
    const { provenance } = mapManifestWithProvenance(manifest());
    expect(provenance.deklarierteAutonomie).toBe("AAL-3");
    expect(provenance.effektiveAutonomie).toBe("AAL-2");
    expect(provenance.autonomieGekappt).toBe(true);
  });

  it("`entwurf-only` (der Mensch führt) macht ebenfalls rechtsnah — die Achse ist die Entscheidung, nicht das Label", () => {
    const m = manifest({
      befugnis: { entscheidung: "entwurf-only", hitlPflicht: true },
    });
    expect(manifestSpineAufgaben(m)).toContain("pruefung");
  });

  it("ÜBERBLOCKUNG: eine NICHT-rechtsnahe Stelle behält ihre deklarierte Autonomie und wird nicht verworfen", () => {
    const auskunft = manifest({
      id: "buerger",
      governance: {
        regeln: [
          { id: "barrierefrei", label: "Barrierefreiheit", art: "optional" },
        ],
      },
      befugnis: { entscheidung: "keine", hitlPflicht: false },
    });
    const c = mapManifestToComposable(auskunft);
    expect(c.spine?.aufgaben).not.toContain("pruefung");
    expect(c.spine?.autonomy).toBe("AAL-3");
  });

  it("die GLOBALE Obergrenze bleibt ein harter Reject — auch (und gerade) bei einer RECHTSNAHEN Stelle", () => {
    // Der gefährliche Fall: die Rechtsnah-Decke darf einen Widerspruch zur Plattform-Obergrenze nicht in ein
    // stilles Kappen verwandeln. AAL-4 ist keine Kappungs-, sondern eine Verwerfungs-Frage.
    expect(() =>
      mapManifestToComposable(
        manifest({ faehigkeiten: { ki: ["x"], autonomie: "AAL-4" } }),
      ),
    ).toThrow(/AAL-3/);
    expect(() =>
      mapManifestToComposable(
        manifest({
          faehigkeiten: { ki: ["x"], autonomie: "AAL-4" },
          befugnis: { entscheidung: "keine", hitlPflicht: false },
        }),
      ),
    ).toThrow(/AAL-3/);
  });
});

describe("① MOUNT — die mitgereiste Verfassung wird nachgerechnet, nicht geglaubt", () => {
  it("eine unveränderte Projektion ist vorhanden ∧ intakt (der Wächter blockt den Normalfall nicht)", () => {
    const p = projektion();
    const v = verifyMeshGovernanceProjektion(p, {
      composableId: ID,
      sha256Hex,
    });
    expect(v.vorhanden).toBe(true);
    expect(v.intakt).toBe(true);
    expect(v.digest).toBe(p.digest);
  });

  it("TAMPER: eine unterwegs gelockerte Befugnis bricht das Siegel", () => {
    const p = projektion();
    const gefaelscht = {
      ...p,
      befugnis: { ...p.befugnis, hitlPflicht: false },
    };
    const v = verifyMeshGovernanceProjektion(gefaelscht, {
      composableId: ID,
      sha256Hex,
    });
    expect(v.vorhanden).toBe(true);
    expect(v.intakt).toBe(false);
    expect(v.gruende.join(" ")).toMatch(/verändert/);
  });

  it("TAMPER: eine heimlich entfernte Schutzregel bricht das Siegel ebenso", () => {
    const p = projektion();
    const v = verifyMeshGovernanceProjektion(
      { ...p, regeln: [] },
      { composableId: ID, sha256Hex },
    );
    expect(v.intakt).toBe(false);
  });

  it("eine Projektion für eine ANDERE Stelle ist inkongruent (fail-closed)", () => {
    const v = verifyMeshGovernanceProjektion(projektion(), {
      composableId: "aufsicht",
      sha256Hex,
    });
    expect(v.intakt).toBe(false);
    expect(v.gruende.join(" ")).toMatch(/inkongruent/);
  });

  it("eine fremde schemaVersion wird abgelehnt statt geraten", () => {
    const v = verifyMeshGovernanceProjektion(
      { ...projektion(), schemaVersion: 1 },
      { composableId: ID, sha256Hex },
    );
    expect(v.intakt).toBe(false);
    expect(v.gruende.join(" ")).toMatch(/schemaVersion/);
  });

  it("GEGENPROBE: OHNE injizierte sha256-Funktion gilt „ungeprüft“ NICHT als „in Ordnung“", () => {
    const v = verifyMeshGovernanceProjektion(projektion(), {
      composableId: ID,
    });
    expect(v.intakt).toBe(false);
    expect(v.gruende.join(" ")).toMatch(/nicht nachgerechnet/);
  });

  it("ÜBERBLOCKUNG: eine Stelle OHNE Projektion (Alt-Bestand) ist „nicht vorhanden“ — kein Mount-Blocker", () => {
    const v = verifyMeshGovernanceProjektion(undefined, {
      composableId: ID,
      sha256Hex,
    });
    expect(v.vorhanden).toBe(false);
    expect(v.gruende.join(" ")).toMatch(/behauptet nichts/);
  });
});

/** Ein in-toto-Verdikt mit beiden Subjekten (Manifest + Governance) — strukturell gültig, aber unverdient
 *  (earned:false), weil es hier nur um die SUBJEKT-Achse geht. */
function verdikt(opts: {
  govDigest?: string | undefined;
  manifestSha256: string;
}): MeshCertFile {
  return {
    statement: {
      _type: IN_TOTO_STATEMENT_TYPE,
      predicateType: COMPOSABLE_CERT_PREDICATE_TYPE,
      subject: [
        { name: ID, digest: { sha256: opts.manifestSha256 } },
        ...(opts.govDigest
          ? [
              {
                name: meshCertGovernanceSubject(ID),
                digest: { sha256: opts.govDigest },
              },
            ]
          : []),
      ],
      predicate: {
        schemaVersion: 1,
        composableId: ID,
        domain: "musterverfahren",
        earned: false,
        scenarios: [] as never[],
      },
    },
  } as unknown as MeshCertFile;
}

describe("① MOUNT — das Verdikt bezeugt, unter WELCHER Governance zertifiziert wurde", () => {
  const MANIFEST_SHA = "b".repeat(64);

  it("mit passendem `<id>#governance`-Subjekt gilt die Governance als bezeugt", () => {
    const p = projektion();
    const v = verifyMeshCertStructure(
      verdikt({
        govDigest: p.digest ?? undefined,
        manifestSha256: MANIFEST_SHA,
      }),
      {
        composableId: ID,
        manifestSha256: MANIFEST_SHA,
        governanceSha256: p.digest ?? null,
      },
    );
    expect(v.governanceAttested).toBe(true);
    expect(v.governanceSha256).toBe(p.digest);
  });

  it("ein Verdikt, das eine ANDERE Governance bezeugt, ist ungültig (ausgetauschte Verfassung)", () => {
    const v = verifyMeshCertStructure(
      verdikt({ govDigest: "c".repeat(64), manifestSha256: MANIFEST_SHA }),
      {
        composableId: ID,
        manifestSha256: MANIFEST_SHA,
        governanceSha256: projektion().digest ?? null,
      },
    );
    expect(v.valid).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/Governance-Projektion weicht ab/);
  });

  it("ein Verdikt bezeugt Governance, die Stelle führt aber keine (gültige) mehr — ungültig", () => {
    const v = verifyMeshCertStructure(
      verdikt({ govDigest: "c".repeat(64), manifestSha256: MANIFEST_SHA }),
      {
        composableId: ID,
        manifestSha256: MANIFEST_SHA,
        governanceSha256: null,
      },
    );
    expect(v.valid).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/nicht mehr nachweisbar/);
  });

  it("GEGENPROBE: OHNE Governance-Subjekt sagt das Verdikt ehrlich NICHTS — und blockt trotzdem nicht", () => {
    const v = verifyMeshCertStructure(
      verdikt({ manifestSha256: MANIFEST_SHA }),
      {
        composableId: ID,
        manifestSha256: MANIFEST_SHA,
        governanceSha256: projektion().digest ?? null,
      },
    );
    expect(v.governanceAttested).toBe(false);
    expect(v.reasons.join(" ")).not.toMatch(/Governance/);
  });
});
