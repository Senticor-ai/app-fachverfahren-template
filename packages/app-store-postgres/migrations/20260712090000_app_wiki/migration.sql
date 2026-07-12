-- Interne WISSENSBASIS/WIKI (#20, Wiki.js-inspiriert) — vom read-only Config-Wissen zur VERSIONIERTEN Wissensbasis.
-- Bisher lebte das Wiki nur als `WorkspaceConfig.wissen` (statisch, kein Speichern/Verlauf). Zwei Tabellen heben es:
--   • app_wiki_articles  — der MUTABLE Kopf je Artikel (aktueller Stand + `version` als Optimistic-Lock).
--   • app_wiki_revisions — die APPEND-ONLY Revisionshistorie (jede Speicherung schreibt genau EINE Revision).
--
-- `upsertArticle` schreibt beide ATOMAR in EINER Transaktion (Kopf sperren → Version prüfen/erhöhen → Revision
-- anhängen). Mandanten-scoped wie alle app_*-Tabellen. Additiv + idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS app_wiki_articles (
  article_id       text NOT NULL,
  tenant_id        text NOT NULL,
  authority_id     text NOT NULL,
  jurisdiction_id  text NOT NULL,
  title            text NOT NULL,
  markdown         text NOT NULL,
  category         text,
  parent_id        text,
  status           text NOT NULL DEFAULT 'veroeffentlicht'
                     CHECK (status IN ('entwurf', 'veroeffentlicht', 'archiviert')),
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Ein Artikel-Slug ist je Mandant eindeutig (derselbe Slug darf in verschiedenen Mandanten existieren).
  PRIMARY KEY (tenant_id, article_id)
);

-- Wiki-Browsing je Behörde: „zuletzt bearbeitet zuerst" effizient.
CREATE INDEX IF NOT EXISTS app_wiki_articles_browse_idx
  ON app_wiki_articles (tenant_id, authority_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_wiki_revisions (
  tenant_id        text NOT NULL,
  article_id       text NOT NULL,
  version          integer NOT NULL CHECK (version >= 1),
  title            text NOT NULL,
  markdown         text NOT NULL,
  category         text,
  parent_id        text,
  status           text NOT NULL
                     CHECK (status IN ('entwurf', 'veroeffentlicht', 'archiviert')),
  editor_actor_id  text NOT NULL,
  change_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Identität = (Mandant, Artikel, Version); `version` ist je Artikel streng monoton → schützt vor Doppel-Revision.
  PRIMARY KEY (tenant_id, article_id, version)
);
