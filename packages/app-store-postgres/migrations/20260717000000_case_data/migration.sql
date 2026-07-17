-- app_cases.data — die Nutzlast eines Falls (frei-formiges jsonb, wie app_tasks.data).
--
-- WARUM: Das Template bedient ZWEI Verfahrens-ARTEN. Die Dossier-/Fall-Art (procedure.config) war server-echt;
-- die ANTRAG-/Leistungs-Art (leistung.config) hatte NIE eine Server-Persistenz — jeder Bürger-Antrag lebte im
-- Browser-Store und ein Reload löschte ihn. Der Grund war nicht Absicht, sondern eine Lücke: app_cases trägt
-- nur die Fall-IDENTITÄT (Verfahren/Zustand/Version/Beteiligte/Zeiten) und hatte keinen Ort für den fachlichen
-- INHALT eines Antrags (Antragsdaten, Berechnung, Nachweis-Stand).
--
-- Damit kann ein Antrag zur AKTE werden, statt eine zweite, parallele Fall-Tabelle daneben zu stellen: er erbt
-- damit alles, was server-autoritativ bereits steht — Anlegen, Übergänge inkl. serverseitigem Vier-Augen,
-- append-only Audit, Optimistic Locking.
--
-- OPAK FÜR DEN SERVER, BEWUSST: der Server interpretiert `data` NICHT. Er kann es auch gar nicht — die
-- fachliche Config (leistung.config.ts) liegt ausserhalb seines rootDir und ist für ihn nicht importierbar.
-- Der Client rechnet, der Server bewahrt auf, stempelt Identität/Zeit und auditiert. Das ist keine Notlösung,
-- sondern deckungsgleich mit der Bestandskraft-Anforderung: ein erlassener Verwaltungsakt DARF nicht aus der
-- lebenden Config neu gerendert werden, sondern muss seine Fachlichkeit als selbsttragendes Datum mitführen.
--
-- Rein additiv + idempotent, kein Backfill: bestehende Fälle bekommen '{}' und verhalten sich unverändert.

ALTER TABLE app_cases
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
