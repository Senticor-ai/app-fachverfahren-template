// testzugang — DIE EINE WAHRHEIT über die vorprovisionierten TESTKONTEN eines Entwicklungsstands.
//
// WARUM es das gibt: solange es keine verifizierte Selbstregistrierung (`open_verified`) und keine
// eID/BundID-Anbindung gibt, ist der Bürgerpfad ohne Konto NICHT begehbar — die Anmeldung verschließt
// ihn. Statt die Authentisierung aufzuweichen (anonymer Zugang, abgeschaltetes Gate) provisioniert der
// Entwicklungsstand ein ausdrücklich als TESTKONTO gekennzeichnetes Konto und WEIST ES AUS (/hilfe).
// Die Sicherheit bleibt unverändert: es wird angemeldet, nur ist der Zugang auffindbar.
//
// EINE WAHRHEIT: dieselbe Deklaration TESTKONTEN speist
//   (a) die ANLAGE der Konten (reference-seed.ts) und
//   (b) die ANZEIGE des Zugangs (Route /dev/testzugang → Seite /hilfe).
// Anlage und Anzeige können damit nicht auseinanderlaufen (ein angezeigtes Konto, das es nicht gibt,
// wäre schlimmer als gar keins).
//
// FAIL-CLOSED (drei unabhängige Bedingungen, ALLE müssen halten — sonst entsteht KEIN Konto und es
// wird KEINS angezeigt):
//   1. `NODE_ENV !== "production"`      — ein Produktivbetrieb bekommt niemals Testkonten.
//   2. `APP_STORE_MODE === "memory"`    — nur der ephemere In-Memory-Store; eine echte Datenhaltung
//                                         (Postgres) ist per Definition kein Entwicklungsstand.
//   3. ein Passwort AUS DER UMGEBUNG   — im Quelltext steht bewusst KEINES (ein committetes Secret
//                                         wäre eine öffentlich bekannte Zugangsdaten-Naht).
// Fehlt eine Bedingung, sagt der Ausweis EHRLICH welche — er tut nicht so, als gäbe es keinen Grund.

/** Arbeitsbereiche (Personas) — Produkt-Erlebnis, keine Autorisierung. */
export type TestkontoPersona = "buerger" | "sachbearbeitung" | "aufsicht";
/** Workspace-Rolle des Kontos — daraus leitet die Autorisierung ihre Rechte ab. */
export type TestkontoRolle = "citizen" | "member" | "admin";

export interface TestkontoDeklaration {
  /** Technischer Schlüssel (Log-Ereignis `runtime.dev-seed.<kind>.*`). */
  readonly kind: string;
  readonly email: string;
  readonly name: string;
  readonly actorId: string;
  readonly rolle: TestkontoRolle;
  readonly personas: readonly TestkontoPersona[];
  /** Wofür dieses Konto im begehbaren Pfad gebraucht wird — die Zeile, die auf /hilfe steht. */
  readonly zweck: string;
  /** Der Einstieg nach der Anmeldung (Pfad in der App). */
  readonly einstieg: string;
}

/** Das ERSTE Konto entsteht über `bootstrapWorkspace` (Workspace-Einrichtung) und ist deshalb
 *  zwingend `admin`; die weiteren über `createLocalUserWithCredential`. Die Reihenfolge in dieser
 *  Liste ist die Reihenfolge der Anlage UND der Anzeige. */
export const TESTKONTO_ADMIN: TestkontoDeklaration = {
  kind: "user",
  email: "sachbearbeitung@example.org",
  name: "Test-Sachbearbeitung",
  // Der Actor entsteht in bootstrapWorkspace (zufällige UUID) — hier nur dokumentarisch leer.
  actorId: "",
  rolle: "admin",
  personas: ["buerger", "sachbearbeitung", "aufsicht"],
  zweck: "Richtet den Arbeitsbereich ein und bearbeitet Vorgänge im Amt.",
  einstieg: "/amt",
};

export const TESTKONTEN: readonly TestkontoDeklaration[] = [
  {
    kind: "citizen",
    email: "buerger@example.org",
    name: "Test-Bürger:in",
    actorId: "actor.dev-citizen",
    rolle: "citizen",
    personas: ["buerger"],
    zweck:
      "Stellt einen Antrag, lädt Anlagen hoch und erhält die Eingangsbestätigung. Die Sachbearbeitung hat bewusst kein Einreichungsrecht.",
    einstieg: "/buerger",
  },
  {
    kind: "caseworker2",
    email: "sachbearbeitung2@example.org",
    name: "Test-Sachbearbeitung II",
    actorId: "actor.dev-caseworker2",
    rolle: "member",
    personas: ["sachbearbeitung"],
    zweck:
      "Zweite Person für das Vier-Augen-Prinzip: die Festsetzung verlangt eine andere Person als den letzten Bearbeitungsschritt.",
    einstieg: "/amt",
  },
];

/** Warum kein Testzugang ausgewiesen wird — jeder Grund ist eine bewusste Sperre, keine Panne. */
export type TestzugangGrund =
  "produktivbetrieb" | "kein-ephemerer-store" | "kein-passwort";

export interface TestzugangKonto {
  readonly email: string;
  readonly name: string;
  readonly passwort: string;
  readonly rolle: TestkontoRolle;
  readonly personas: readonly TestkontoPersona[];
  readonly zweck: string;
  readonly einstieg: string;
}

export interface TestzugangAktiv {
  readonly aktiv: true;
  /** Der ehrliche Hinweis, der über den Konten steht — keine echte Identität, kein echtes Konto. */
  readonly hinweis: string;
  readonly konten: readonly TestzugangKonto[];
}

export interface TestzugangGesperrt {
  readonly aktiv: false;
  readonly grund: TestzugangGrund;
  readonly erklaerung: string;
}

export type TestzugangAusweis = TestzugangAktiv | TestzugangGesperrt;

export const TESTZUGANG_HINWEIS =
  "TESTKONTEN eines Entwicklungsstands — synthetisch, ohne Identitätsnachweis, mit ephemeren Daten. " +
  "Sie sind KEINE echten Konten und entstehen in einem Produktivbetrieb nicht.";

const ERKLAERUNG: Record<TestzugangGrund, string> = {
  produktivbetrieb:
    "NODE_ENV=production: in einem Produktivbetrieb entstehen keine Testkonten.",
  "kein-ephemerer-store":
    "Kein ephemerer Store (APP_STORE_MODE≠memory): Testkonten gibt es nur im Entwicklungsstand mit flüchtigen Daten.",
  "kein-passwort":
    "Kein Passwort aus der Umgebung (APP_DEV_SEED_PASSWORD bzw. AUTH_BOOTSTRAP_ADMIN_PASSWORD): im Quelltext steht bewusst keines.",
};

/** Die Sperr-Prüfung ohne Passwörter — geteilt von Anlage (Seed) und Anzeige (Route). */
function sperre(env: NodeJS.ProcessEnv): TestzugangGrund | null {
  if (env["NODE_ENV"] === "production") return "produktivbetrieb";
  if (env["APP_STORE_MODE"] !== "memory") return "kein-ephemerer-store";
  return null;
}

/** Das Passwort der über `APP_DEV_SEED_PASSWORD` provisionierten Konten — leer ⇒ es entsteht keins. */
export function seedPasswort(env: NodeJS.ProcessEnv): string | undefined {
  const wert = env["APP_DEV_SEED_PASSWORD"];
  return wert === undefined || wert === "" ? undefined : wert;
}

/** Wahr, wenn dieser Lauf Testkonten ANLEGEN darf. Die Seeds fragen ausschließlich hier — damit die
 *  Sperre nicht an zwei Stellen unterschiedlich formuliert werden kann. */
export function testzugangAnlageErlaubt(env: NodeJS.ProcessEnv): boolean {
  return sperre(env) === null && seedPasswort(env) !== undefined;
}

/** Der AUSWEIS: welche Testkonten dieser Stand vorprovisioniert hat — oder warum keine.
 *  Enthält nur Konten, deren Passwort tatsächlich AUS DER UMGEBUNG kommt; nichts wird geraten. */
export function testzugangAusweis(
  env: NodeJS.ProcessEnv = process.env,
): TestzugangAusweis {
  const grund = sperre(env);
  if (grund !== null)
    return { aktiv: false, grund, erklaerung: ERKLAERUNG[grund] };

  const konten: TestzugangKonto[] = [];
  // Das Workspace-Konto: entweder aus AUTH_BOOTSTRAP_ADMIN_* (so provisioniert die Vorschau) oder,
  // wenn das fehlt, aus dem Seed-Passwort (dann legt der Seed selbst das erste Konto an).
  const adminEmail = env["AUTH_BOOTSTRAP_ADMIN_EMAIL"]?.trim();
  const adminPasswort = env["AUTH_BOOTSTRAP_ADMIN_PASSWORD"];
  const seed = seedPasswort(env);
  if (adminEmail && adminPasswort) {
    konten.push({
      ...TESTKONTO_ADMIN,
      email: adminEmail,
      name: env["AUTH_BOOTSTRAP_ADMIN_NAME"]?.trim() || TESTKONTO_ADMIN.name,
      passwort: adminPasswort,
    });
  } else if (seed !== undefined) {
    konten.push({ ...TESTKONTO_ADMIN, passwort: seed });
  }
  if (seed !== undefined) {
    for (const k of TESTKONTEN) konten.push({ ...k, passwort: seed });
  }

  if (konten.length === 0)
    return {
      aktiv: false,
      grund: "kein-passwort",
      erklaerung: ERKLAERUNG["kein-passwort"],
    };
  return { aktiv: true, hinweis: TESTZUGANG_HINWEIS, konten };
}
