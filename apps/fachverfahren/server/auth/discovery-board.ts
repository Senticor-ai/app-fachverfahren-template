import type {
  Board,
  BoardCard,
  BoardColumn,
  CardKind,
  KanbanStore,
} from "@senticor/app-store-postgres";
import { nextPositionKey } from "@senticor/app-store-postgres";

export const DISCOVERY_TEMPLATE_KEY = "fachverfahren-discovery-v1";
export const DISCOVERY_TEMPLATE_VERSION = 1;

interface ColumnSeed {
  title: string;
}

interface CardSeed {
  sourceKey: string;
  column: string;
  title: string;
  descriptionMarkdown: string;
  kind: CardKind;
}

// Kanban plan decision 14: a small, curated starter set concentrated in the
// earliest columns — a fresh workspace should look like real starting work,
// not a board that's suspiciously already full of "Done" cards. This is
// deliberately distinct from the "kanban-busy-fixture" dataset used only in
// Storybook/tests (never seeded into a real bootstrap).
const COLUMN_SEEDS: ColumnSeed[] = [
  { title: "Inbox / Fragen" },
  { title: "Verstehen" },
  { title: "Entscheiden" },
  { title: "Bereit" },
  { title: "Umsetzen" },
  { title: "Prüfen" },
  { title: "Fertig / Gelernt" },
];

const CARD_SEEDS: CardSeed[] = [
  {
    sourceKey: "service-outcome",
    column: "Inbox / Fragen",
    title: "Leistungsziel und Zielgruppe definieren",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nOhne ein klares Ziel lässt sich weder der Antragsweg noch der Erfolg der Leistung beurteilen.\n\n## Checkliste\n\n- [ ] Welches Problem löst diese Leistung für Bürger:innen/Unternehmen?\n- [ ] Wer sind die Nutzenden konkret?\n- [ ] Wie sieht Erfolg aus?",
    kind: "question",
  },
  {
    sourceKey: "current-process",
    column: "Verstehen",
    title: "Bestehenden Prozess erfassen",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nDie Digitalisierung eines unklaren Prozesses digitalisiert die Unklarheit mit.\n\n## Checkliste\n\n- [ ] Wie läuft der Vorgang heute ab (Papier, Amt, Fristen)?\n- [ ] Welche Beteiligten/Ämter sind involviert?\n- [ ] Wo entstehen heute Rückfragen oder Verzögerungen?",
    kind: "research",
  },
  {
    sourceKey: "legal-basis",
    column: "Verstehen",
    title: "Rechtsgrundlage identifizieren",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\n`rechtsgrundlagen` in der Austausch-Naht darf nur belegte Normen enthalten — nie erfundene.\n\n## Checkliste\n\n- [ ] Welche Norm(en)/Satzung tragen diese Leistung?\n- [ ] Gibt es kommunale Satzungsspielräume?\n- [ ] Wer bestätigt die Rechtsgrundlage verbindlich?",
    kind: "research",
  },
  {
    sourceKey: "personas",
    column: "Verstehen",
    title: "Personas definieren",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nBürger:in, Sachbearbeitung und Aufsicht brauchen unterschiedliche Sichten und Rechte.\n\n## Checkliste\n\n- [ ] Welche Rollen wirken auf einen Vorgang ein?\n- [ ] Wer entscheidet, wer bereitet nur vor?\n- [ ] Gibt es Rollen außerhalb der drei Standard-Personas?",
    kind: "decision",
  },
  {
    sourceKey: "data-categories",
    column: "Entscheiden",
    title: "Benötigte Daten und Datenklassen festlegen",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nDatenklassen bestimmen Schutzbedarf, Aufbewahrung und Berechtigungen.\n\n## Checkliste\n\n- [ ] Welche Felder sind zwingend erforderlich?\n- [ ] Welche Daten sind besonders sensibel?\n- [ ] Gibt es Once-Only-Register, die genutzt werden können?",
    kind: "decision",
  },
  {
    sourceKey: "identity-assurance",
    column: "Entscheiden",
    title: "Authentifizierung und Vertrauensniveau festlegen",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nNicht jede Leistung braucht das höchste eID-Vertrauensniveau — die Wahl hat UX- und Kostenfolgen.\n\n## Checkliste\n\n- [ ] Welches Vertrauensniveau ist rechtlich/fachlich nötig?\n- [ ] Reicht ein Nutzerkonto ohne eID?\n- [ ] Wie wird ein Step-up-Vorgang gehandhabt, falls nötig?",
    kind: "decision",
  },
  {
    sourceKey: "roles-four-eyes",
    column: "Entscheiden",
    title: "Rollen und Vier-Augen-Prinzip klären",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nKritische Entscheidungen brauchen serverseitig erzwungene Vier-Augen-Prüfung, nicht nur eine UI-Konvention.\n\n## Checkliste\n\n- [ ] Welche Übergänge in der Statusmaschine sind kritisch?\n- [ ] Wer darf eine Entscheidung nicht selbst gegenzeichnen?\n- [ ] Wie wird das serverseitig geprüft?",
    kind: "decision",
  },
  {
    sourceKey: "mvp-hypotheses",
    column: "Bereit",
    title: "MVP-Hypothesen und Erfolgskriterien festlegen",
    descriptionMarkdown:
      "## Hypothese\n\nWir glauben, dass …\n\n## Benötigte Evidenz\n\n- [ ]\n\n## Validierungsmethode\n\n## Erfolgskriterium",
    kind: "hypothesis",
  },
  {
    sourceKey: "accessibility-language",
    column: "Bereit",
    title: "Barrierefreiheit und Sprache prüfen",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nBITV 2.0/WCAG 2.2 AA ist verbindlich; Leichte Sprache und Mehrsprachigkeit sind eigene Anforderungen.\n\n## Checkliste\n\n- [ ] Braucht diese Leistung Leichte-Sprache-Varianten?\n- [ ] In welchen Sprachen muss die Oberfläche verfügbar sein?\n- [ ] Wer führt die Accessibility-Prüfung durch?",
    kind: "task",
  },
  {
    sourceKey: "privacy-security",
    column: "Bereit",
    title: "Datenschutz- und Sicherheitsbewertung einplanen",
    descriptionMarkdown:
      "## Warum das wichtig ist\n\nEine späte Datenschutzprüfung blockiert typischerweise den Piloten.\n\n## Checkliste\n\n- [ ] Wer führt die Bewertung durch (DPO, Sicherheitsteam)?\n- [ ] Bis wann muss sie vorliegen?\n- [ ] Welche Datenkategorien sind besonders zu betrachten?",
    kind: "risk",
  },
  {
    sourceKey: "operations-ownership",
    column: "Bereit",
    title: "Betrieb und Zuständigkeit klären",
    descriptionMarkdown:
      '## Warum das wichtig ist\n\n"Fertig gebaut" ist nicht dasselbe wie "betriebsbereit".\n\n## Checkliste\n\n- [ ] Wer hostet und betreibt die Leistung im Alltag?\n- [ ] Wer übernimmt Support bei Störungen?\n- [ ] Wie läuft Backup/Restore ab?',
    kind: "task",
  },
  {
    sourceKey: "definition-of-ready-done",
    column: "Bereit",
    title: "Definition of Ready / Definition of Done festlegen",
    descriptionMarkdown:
      '## Warum das wichtig ist\n\nOhne gemeinsame Definition wird "fertig" für jede Karte neu verhandelt.\n\n## Checkliste\n\n- [ ] Wann ist eine Karte bereit für die Umsetzung?\n- [ ] Wann gilt eine Karte als abgeschlossen?\n- [ ] Wer nimmt ab?',
    kind: "decision",
  },
];

export interface DiscoveryBoardIds {
  generateId: (prefix: string) => string;
}

export interface SeedDiscoveryBoardInput {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  ownerActorId: string;
  contentLocale: string;
  now: Date;
}

export async function seedDiscoveryBoard(
  store: KanbanStore,
  input: SeedDiscoveryBoardInput,
  ids: DiscoveryBoardIds,
): Promise<Board> {
  const nowIso = input.now.toISOString();

  const board = await store.createBoard({
    boardId: ids.generateId("board"),
    tenantId: input.tenantId,
    authorityId: input.authorityId,
    jurisdictionId: input.jurisdictionId,
    ownerActorId: input.ownerActorId,
    title: "Build the Fachverfahren",
    description:
      "Definieren, validieren, bauen und betreiben Sie die richtige Fachverfahren-Anwendung.",
    visibility: "personal",
    contentLocale: input.contentLocale,
    templateKey: DISCOVERY_TEMPLATE_KEY,
    templateVersion: DISCOVERY_TEMPLATE_VERSION,
    version: 1,
    archivedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const columnsByTitle = new Map<string, BoardColumn>();
  let previousColumnKey: string | null = null;
  for (const seed of COLUMN_SEEDS) {
    const positionKey = nextPositionKey(previousColumnKey, null);
    const column = await store.createColumn({
      columnId: ids.generateId("column"),
      boardId: board.boardId,
      title: seed.title,
      positionKey,
      version: 1,
      archivedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    columnsByTitle.set(seed.title, column);
    previousColumnKey = positionKey;
  }

  const lastPositionKeyByColumn = new Map<string, string | null>();
  const seededCards: BoardCard[] = [];
  for (const seed of CARD_SEEDS) {
    const column = columnsByTitle.get(seed.column);
    if (!column) {
      throw new Error(
        `discovery board seed references unknown column "${seed.column}"`,
      );
    }
    const previousKey = lastPositionKeyByColumn.get(column.columnId) ?? null;
    const positionKey = nextPositionKey(previousKey, null);
    lastPositionKeyByColumn.set(column.columnId, positionKey);

    const card = await store.createCard({
      cardId: ids.generateId("card"),
      boardId: board.boardId,
      columnId: column.columnId,
      title: seed.title,
      descriptionMarkdown: seed.descriptionMarkdown,
      kind: seed.kind,
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey,
      labels: [],
      sourceKey: seed.sourceKey,
      createdByActorId: input.ownerActorId,
      version: 1,
      archivedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    seededCards.push(card);
  }

  return board;
}
