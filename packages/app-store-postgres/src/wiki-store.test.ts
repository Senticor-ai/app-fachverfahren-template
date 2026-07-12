import { describe, it, expect, beforeAll } from "vitest";
import {
  type UpsertWikiArticleInput,
  type WikiStore,
  InMemoryWikiStore,
  PostgresWikiStore,
  WikiVersionConflictError,
} from "./wiki-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheUpsert(
  over: Partial<UpsertWikiArticleInput> = {},
): UpsertWikiArticleInput {
  return {
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    articleId: `wiki-${uid()}`,
    title: "Handbuch",
    markdown: "# Handbuch\nInhalt.",
    editorActorId: "sb.a",
    expectedVersion: 0,
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => WikiStore; enabled: boolean }[] = [
  {
    name: "InMemoryWikiStore",
    make: () =>
      new InMemoryWikiStore({ now: () => "2026-06-02T00:00:00.000Z" }),
    enabled: true,
  },
  {
    name: "PostgresWikiStore",
    make: () => new PostgresWikiStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`WikiStore contract — ${impl.name}`, () => {
    let store: WikiStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("legt einen Artikel an (Version 1), liest ihn zurück (mandanten-scoped)", async () => {
      const input = macheUpsert({ category: "Handbuch" });
      const head = await store.upsertArticle(input);
      expect(head.version).toBe(1);
      expect(head.status).toBe("veroeffentlicht"); // Default
      expect(head.category).toBe("Handbuch");
      expect(head.parentId).toBeNull();

      const back = await store.getArticle({
        tenantId: "t1",
        articleId: input.articleId,
      });
      expect(back?.title).toBe("Handbuch");
      // Fremd-Mandant sieht den Artikel NICHT.
      expect(
        await store.getArticle({ tenantId: "t2", articleId: input.articleId }),
      ).toBeUndefined();
    });

    it("speichert eine neue Version (Optimistic-Lock) und führt die Revisionshistorie (neueste zuerst)", async () => {
      const id = `wiki-${uid()}`;
      await store.upsertArticle(
        macheUpsert({ articleId: id, title: "V1", markdown: "eins" }),
      );
      const v2 = await store.upsertArticle(
        macheUpsert({
          articleId: id,
          title: "V2",
          markdown: "zwei",
          editorActorId: "sb.b",
          changeNote: "Korrektur",
          expectedVersion: 1,
        }),
      );
      expect(v2.version).toBe(2);
      expect(v2.title).toBe("V2");

      const head = await store.getArticle({ tenantId: "t1", articleId: id });
      expect(head?.markdown).toBe("zwei"); // Kopf trägt den AKTUELLEN Stand.

      const revs = await store.listRevisions({ tenantId: "t1", articleId: id });
      expect(revs.map((r) => r.version)).toEqual([2, 1]); // neueste zuerst
      // Die alte Revision bleibt ein unveränderter Snapshot.
      expect(revs[1]?.markdown).toBe("eins");
      expect(revs[1]?.title).toBe("V1");
      expect(revs[0]?.editorActorId).toBe("sb.b");
      expect(revs[0]?.changeNote).toBe("Korrektur");
    });

    it("friert authorityId/jurisdictionId bei einem Update EIN (ein Edit wandert nie in eine andere Behörde)", async () => {
      const id = `wiki-${uid()}`;
      await store.upsertArticle(
        macheUpsert({
          articleId: id,
          authorityId: "b1",
          jurisdictionId: "de",
        }),
      ); // → v1 unter b1/de
      // Ein Update, das (versehentlich oder böswillig) eine ANDERE Behörde/jurisdiction mitschickt, darf den Artikel
      // NICHT umziehen — sonst entzöge ein reiner Inhalts-Edit ihn still dem Browse-Scope seiner Behörde. Beide
      // Laufzeiten MÜSSEN identisch einfrieren (InMemory==PG, Lehre #24).
      const v2 = await store.upsertArticle(
        macheUpsert({
          articleId: id,
          authorityId: "b2",
          jurisdictionId: "at",
          title: "Editiert",
          expectedVersion: 1,
        }),
      );
      expect(v2.authorityId).toBe("b1"); // eingefroren, NICHT b2
      expect(v2.jurisdictionId).toBe("de"); // eingefroren, NICHT at
      expect(v2.title).toBe("Editiert"); // Inhalt aber sehr wohl aktualisiert
      // Der Artikel bleibt im Browse-Scope seiner ursprünglichen Behörde und taucht NICHT unter b2 auf.
      const unterB1 = await store.listArticles({
        tenantId: "t1",
        authorityId: "b1",
      });
      expect(unterB1.map((a) => a.articleId)).toContain(id);
      const unterB2 = await store.listArticles({
        tenantId: "t1",
        authorityId: "b2",
      });
      expect(unterB2.map((a) => a.articleId)).not.toContain(id);
    });

    it("verweigert eine Speicherung mit veralteter erwarteter Version (409-Konflikt)", async () => {
      const id = `wiki-${uid()}`;
      await store.upsertArticle(macheUpsert({ articleId: id })); // → v1
      await store.upsertArticle(
        macheUpsert({ articleId: id, expectedVersion: 1 }),
      ); // → v2
      // Ein zweiter Bearbeiter mit veralteter Sicht (erwartet noch v1) darf NICHT überschreiben.
      await expect(
        store.upsertArticle(
          macheUpsert({ articleId: id, expectedVersion: 1, title: "stale" }),
        ),
      ).rejects.toBeInstanceOf(WikiVersionConflictError);
      // Der Kopf ist unverändert bei v2 geblieben.
      expect(
        (await store.getArticle({ tenantId: "t1", articleId: id }))?.version,
      ).toBe(2);
    });

    it("verweigert eine Neuanlage (expectedVersion=0) auf einen bereits existierenden Artikel", async () => {
      const id = `wiki-${uid()}`;
      await store.upsertArticle(macheUpsert({ articleId: id })); // → v1
      await expect(
        store.upsertArticle(macheUpsert({ articleId: id, expectedVersion: 0 })),
      ).rejects.toBeInstanceOf(WikiVersionConflictError);
    });

    it("listet Artikel behörden-scoped und isoliert fremde Mandanten/Behörden", async () => {
      const tid = `t-${uid()}`;
      const eigen = macheUpsert({ tenantId: tid, authorityId: "b1" });
      const fremdeBehoerde = macheUpsert({ tenantId: tid, authorityId: "b2" });
      const fremderMandant = macheUpsert({ tenantId: `t-${uid()}` });
      await store.upsertArticle(eigen);
      await store.upsertArticle(fremdeBehoerde);
      await store.upsertArticle(fremderMandant);

      const liste = await store.listArticles({
        tenantId: tid,
        authorityId: "b1",
      });
      const ids = liste.map((a) => a.articleId);
      expect(ids).toContain(eigen.articleId);
      expect(ids).not.toContain(fremdeBehoerde.articleId); // andere Behörde
      expect(ids).not.toContain(fremderMandant.articleId); // anderer Mandant
      expect(
        liste.every((a) => a.tenantId === tid && a.authorityId === "b1"),
      ).toBe(true);
    });
  });
}

// Tie-Stabilität der Listen-Sortierung: bei GLEICHER updated_at MUSS der article_id-Tiebreak greifen (Lehre aus
// #24). Deterministisch nur mit fixer Uhr prüfbar — Postgres stempelt separate upserts mit realer now() je TX, die
// „newest first"-Ordnung ist dort durch die echten Zeitstempel gedeckt (gleiches Muster wie notification-store).
describe("InMemoryWikiStore — Sortierung ist tie-stabil bei gleichem Zeitstempel", () => {
  it("ordnet bei identischer updated_at deterministisch nach article_id", async () => {
    const store = new InMemoryWikiStore({
      now: () => "2026-06-02T00:00:00.000Z",
    });
    const tid = `t-${uid()}`;
    // In NICHT-sortierter id-Reihenfolge anlegen — nur der Tiebreak stellt die aufsteigende Ordnung her.
    for (const aid of ["wiki-z", "wiki-a", "wiki-m"]) {
      await store.upsertArticle(
        macheUpsert({ tenantId: tid, authorityId: "b1", articleId: aid }),
      );
    }
    const liste = await store.listArticles({
      tenantId: tid,
      authorityId: "b1",
    });
    expect(liste.map((a) => a.articleId)).toEqual([
      "wiki-a",
      "wiki-m",
      "wiki-z",
    ]);
  });
});
