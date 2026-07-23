---
bump: minor
updateMode: review
migration: none
---

Ergänzt eine server-autoritative Fristprüfung für den Rechtsbehelf (Issue #61,
Akzeptanzkriterium „verspäteter Rechtsbehelf erkannt").

Neu im SDK: `rechtsbehelfVerfristetAb` / `istRechtsbehelfVerfristet` — reine,
deterministische Berechnung des Fristablaufs (§§ 187 Abs. 1, 188 BGB,
Standardfall; Monatsende-Klemmung) aus dem EINGEFRORENEN Rechtsbehelf-Regime des
Verwaltungsakts (`fristWert`/`fristEinheit`, regime-neutral) + dem
Bekanntgabe-Anker. Bewusst server-seitig und getrennt von der Client-Anzeige-Frist
(`fachverfahren-kit/lib/frist.ts`): die zulässigkeitsrelevante Berechnung darf nie
von Client-Code abhängen (Autorität nur server-seitig).

`POST /api/buerger/antraege/:id/widerspruch` nutzt sie: der Anker ist die
Bekanntgabe (erstes `case.disclosed`, der Abruf des eigenen Bescheids), die Frist
das eingefrorene Regime. Das Ergebnis wird als `verfristet` (+ `fristAblaufIso`)
in der Antwort UND im append-only `case.objection`-Ereignis mitgeführt.

EHRLICH: `verfristet` FLAGGT nur den regulären Fristablauf — es weist den
Rechtsbehelf NICHT zurück. § 58 Abs. 2 VwGO (fehlende/falsche
Rechtsbehelfsbelehrung → Jahresfrist) und die Wiedereinsetzung (§ 60 VwGO / § 32
VwVfG) werden nicht geprüft; die Zulässigkeitsentscheidung bleibt der Behörde.

Offen (bewusst): der behördenseitige Abhilfe-/Nichtabhilfe-Zweig als eigene
auditierte Übergänge (AK #2 von #61).
