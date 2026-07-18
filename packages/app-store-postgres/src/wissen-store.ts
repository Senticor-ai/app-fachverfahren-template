// wissen-store — der VERFAHRENS-WISSENS-Store: das generelle, KI-gestützte Wiki EINES Fachverfahrens
// (Normen-Auslegung, Arbeitshilfen, FAQ, Fähigkeiten), verfahrens-scoped statt fall-scoped. Er ist die
// durable Ebene der Brücke Mensch↔KI-Agent↔Composable: Mensch UND Agent hinterlassen typisierte Wissens-
// Einträge, die chos-code später in Skills + Kontext übersetzt. APPEND-ONLY (eine Korrektur ist ein neuer
// Eintrag) und mandanten-/behörden-scoped — dieselbe Zellform wie der Fall-Aktenvermerk (Zwei-Ebenen-
// Symmetrie), nur an der ProcedureVersion verankert.
//
// TRIAS wie CaseStore/TaskStore: InMemory (DEV/Tests) · Unavailable (fail-closed) · createXFromEnv. Der
// Postgres-Adapter + die Migration sind der nächste Ausbauschritt (konsistent mit der übrigen Postgres-
// Politik); der Standalone-/OSS-DEV-Pfad läuft auf InMemory. In PROD sitzt derselbe Store hinter der Naht.

/** Ein Wissens-Eintrag eines Verfahrens (dieselbe Zellform wie der Fall-Aktenvermerk, verfahrens-scoped). */
export interface VerfahrensWissenEintrag {
  eintragId: string;
  procedureId: string;
  procedureVersion: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  /** Akteurs-Kennung (server-autoritativ aus der Sitzung). */
  actorId: string;
  /** Zell-Typ (wissen/faehigkeit/notiz/reflexion/… — frei, die BFF-Schicht kuratiert das Vokabular). */
  art: string;
  /** Peer-Kennung: `human:<rolle>` ODER Modell/Agent. */
  urheber: string;
  text: string;
  /** Strukturierte, agenten-konsumierbare Metadaten. */
  metadaten: Record<string, unknown>;
  occurredAt: string;
}

export interface WissenQuery {
  tenantId: string;
  authorityId: string;
  procedureId: string;
  procedureVersion: string;
  limit?: number;
}

export interface WissenStore {
  /** Append-only: einen Wissens-Eintrag anfügen (nie ändern/löschen). */
  appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag>;
  /** Die Wissens-Einträge eines Verfahrens (behörden-scoped), chronologisch aufsteigend. */
  listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]>;
  ping?(): Promise<void>;
}

/** Defensive Kopie — der Store gibt NIE eine Referenz auf seinen internen Zustand heraus (append-only:
 *  eine Caller-Mutation darf die gespeicherte Zelle nicht verändern). */
function clone(e: VerfahrensWissenEintrag): VerfahrensWissenEintrag {
  return { ...e, metadaten: { ...e.metadaten } };
}

/** In-Memory, append-only. Für DEV/Preview/Tests; der Standalone-Pfad des Templates. */
export class InMemoryWissenStore implements WissenStore {
  private readonly eintraege: VerfahrensWissenEintrag[] = [];

  async appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag> {
    this.eintraege.push(clone(eintrag));
    return clone(eintrag);
  }

  async listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]> {
    const treffer = this.eintraege
      .filter(
        (e) =>
          e.tenantId === query.tenantId &&
          e.authorityId === query.authorityId &&
          e.procedureId === query.procedureId &&
          e.procedureVersion === query.procedureVersion,
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map(clone);
    return query.limit !== undefined ? treffer.slice(0, query.limit) : treffer;
  }

  async ping(): Promise<void> {
    // In-Memory ist immer bereit.
  }
}

/** Fail-closed: kein stiller Fallback ohne echte Persistenz. */
export class UnavailableWissenStore implements WissenStore {
  constructor(private readonly reason: string) {}
  async appendEintrag(): Promise<VerfahrensWissenEintrag> {
    throw new Error(this.reason);
  }
  async listEintraege(): Promise<VerfahrensWissenEintrag[]> {
    throw new Error(this.reason);
  }
  async ping(): Promise<void> {
    throw new Error(this.reason);
  }
}

/**
 * Wählt den WissenStore aus der Umgebung. `APP_STORE_MODE=memory` → InMemory (DEV/Preview/Standalone).
 * Sonst fail-closed `Unavailable`: der Postgres-Adapter + die Migration sind der nächste Ausbauschritt
 * (Naht wie CaseStore/TaskStore) — kein stiller In-Memory-Fallback in PROD.
 */
export function createWissenStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WissenStore {
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryWissenStore();
  return new UnavailableWissenStore(
    "WissenStore: kein persistenter Adapter konfiguriert (nur APP_STORE_MODE=memory; Postgres-Adapter ist der nächste Ausbauschritt).",
  );
}
