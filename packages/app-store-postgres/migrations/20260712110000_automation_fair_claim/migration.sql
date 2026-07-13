-- #15 FAIRER per-Tenant-Claim — Multi-Tenancy-at-Scale (Skalierungsplan). ROOT CAUSE: claimDueEvents ordnete bisher
-- global `ORDER BY created_at ASC` (FIFO). Flutet EIN Mandant die Outbox mit tausenden Events, besetzt er die
-- fruehesten created_at-Slots → jeder Claim-Tick liefert nur SEINE Events, andere Mandanten VERHUNGERN.
--
-- Der 1. Fix-Versuch wurde REVERTIERT: eine korrelierte In-Flight-Count-Subquery als FUEHRENDER ORDER-BY-Schluessel
-- ist un-indexierbar und zerstoerte die LIMIT-Frueh-Terminierung (O(limit) → O(backlog)) — verschlimmert die Flut.
--
-- Dieser Fix vermeidet genau das: jedes Event bekommt bei der ANLAGE einen per-Tenant `fair_rank` (0,1,2,… je
-- Mandant). Der Claim ordnet `ORDER BY fair_rank, created_at, event_id` — ein ROUND-ROBIN ueber Mandanten: die
-- SPAETEN Flut-Events eines Mandanten tragen hohe Raenge, ein ruhiger Mandant mit einem Rang-0-Event wird NIE
-- verdraengt. Die Frueh-Terminierung BLEIBT ERHALTEN (EIN ORDER-BY ueber INDIZIERTE Spalten + LIMIT; KEINE
-- korrelierte Subquery) — BY CONSTRUCTION, nicht planer-abhaengig. Additiv/rueckwaertskompatibel.

ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS fair_rank bigint;

-- Bestehende PENDING-Events fair einordnen (per-Tenant chronologisch, 0-indexiert) — NUR unverarbeitete (deckungsgleich
-- zur pending-only-Semantik des Triggers). Verarbeitete Zeilen behalten fair_rank NULL: unschaedlich, da sie weder
-- geclaimt (Claim filtert processed_at IS NULL) noch von Trigger-MIN/MAX beruecksichtigt werden. (Ueber ALLE Zeilen zu
-- zaehlen wuerde etablierten Mandanten kuenstlich hohe Pending-Raenge geben und sie direkt nach Deploy verhungern lassen.)
UPDATE app_automation_events e
   SET fair_rank = z.rn
  FROM (
    SELECT event_id,
           row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, event_id) - 1 AS rn
    FROM app_automation_events
    WHERE processed_at IS NULL
  ) z
 WHERE e.event_id = z.event_id AND e.fair_rank IS NULL;

-- Index fuer die MAX+1-Vergabe im Trigger: der per-Tenant hoechste Rang UNTER DEN UNVERARBEITETEN Events ist ein
-- reiner Index-Seek (kein Scan). Partial WHERE processed_at IS NULL — nur die pending-Warteschlange zaehlt.
CREATE INDEX IF NOT EXISTS app_automation_events_fairseq_idx
  ON app_automation_events (tenant_id, fair_rank)
  WHERE processed_at IS NULL;

-- BEFORE-INSERT-Trigger vergibt den fair_rank per VIRTUAL-TIME FAIR QUEUING (WFQ), sofern nicht gesetzt:
--   fair_rank = GREATEST( per-Tenant MAX(fair_rank UNTER pending)+1 ,  GLOBALES MIN(fair_rank UNTER pending) )
-- Der zweite Term (die „virtuelle Zeit" = aktuelle Front der unverarbeiteten Warteschlange) ist der Schluessel:
--   • Ein NEUER/leerer Mandant startet NICHT bei 0, sondern an der Front V — er kann bereits zurueckgestaute Events
--     NICHT ueberholen (verhindert das Verhungern ETABLIERTER, dauer-aktiver Mandanten durch Rang-0-Neuzugaenge).
--   • Ein FLUTENDER Mandant klettert ueber seinen per-Tenant MAX+1 weit ueber V → wird deprioritisiert (Fairness beim Flut).
--   • Steady State: alle nahe V → faire Verschraenkung. Fair in BEIDEN Richtungen.
-- MIN/MAX sind reine Index-Seeks (fairclaim_idx bzw. fairseq_idx, beide partial WHERE processed_at IS NULL) → die
-- Frueh-Terminierung des Claims bleibt unberuehrt. Deckt ALLE Insert-Pfade transparent ab (EINE Wahrheit). Ein Rennen
-- zweier Inserts kann denselben Rang vergeben — UNSCHAEDLICH (der Claim bricht Gleichstand ueber created_at, event_id).
CREATE OR REPLACE FUNCTION app_automation_events_fair_rank()
RETURNS trigger AS $$
BEGIN
  IF NEW.fair_rank IS NULL THEN
    NEW.fair_rank := GREATEST(
      COALESCE(
        (SELECT MAX(fair_rank) FROM app_automation_events
          WHERE tenant_id = NEW.tenant_id AND processed_at IS NULL),
        -1
      ) + 1,
      COALESCE(
        (SELECT MIN(fair_rank) FROM app_automation_events WHERE processed_at IS NULL),
        0
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_automation_events_fair_rank ON app_automation_events;
CREATE TRIGGER app_automation_events_fair_rank
  BEFORE INSERT ON app_automation_events
  FOR EACH ROW EXECUTE FUNCTION app_automation_events_fair_rank();

-- Claim-Index: fair-geordnete, unverarbeitete Events effizient auffindbar (Frueh-Terminierung fuer
-- `ORDER BY fair_rank, created_at, event_id LIMIT n` unter dem claimbaren Partial-Praedikat).
CREATE INDEX IF NOT EXISTS app_automation_events_fairclaim_idx
  ON app_automation_events (fair_rank, created_at, event_id)
  WHERE processed_at IS NULL;
