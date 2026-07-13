---
bump: minor
updateMode: review
migration: none
---

Die App hat jetzt EINE unauthentifizierte Landing-Page unter `/` (Anmeldung
für alle Rollen: Login, Einmal-Setup, API-Hinweis, Bereichs-Einstiege) und ein
Session-Gate über ALLEN übrigen Routen: `/buerger*`, `/amt*`, `/aufsicht`
sind — wie `/boards` — anmeldepflichtig (`RequireSessionOutlet` in
`apps/*/src/App.tsx`; `/login` bleibt Alias auf `/`). Der bisherige stille
Redirect `/` → `/buerger` und die login-freie Persona-Demo entfallen; die
login-freie Demo der Bausteine ist Storybook. Reine Frontend-Previews ohne
erreichbare API zeigen nur noch die Landing mit „Server nicht erreichbar" —
wer das Gate dort lockern will, spiegelt die FirstRunGate-Ausnahme
(`apiAvailable === false` → nicht gaten) in `RequireSessionOutlet`.

Außerdem antwortet `GET /auth/status` ohne erreichbaren Auth-Store (kein
`APP_PG_URL`, DB down) jetzt degradiert mit `200` +
`{ bootstrapped: false, storeAvailable: false }` statt `500`; der Client
(`session-state.ts`) behandelt das wie „API nicht erreichbar". Damit loggt
der Browser keinen Ressourcen-Fehler und der hermetische PWA-Browser-Audit
läuft grün gegen die Landing.

Consumer-Wirkung: `apps/*/src/**`, `apps/*/tests/**` und
`scripts/check-pwa-browser.mjs` sind NICHT update-verwaltet (dokumentierter
Opt-out in `ownership-parity.test.ts`) — Bestandskonsumenten erhalten Landing
und Gate nur per Re-Scaffold oder manuelle Übernahme. `apps/*/server/**` IST
update-verwaltet: Konsumenten erhalten die degradierte `/auth/status`-Antwort
auch ohne den neuen Client; deren alte `LoginPage` zeigt bei DB-Ausfall dann
das Setup-Formular statt des API-Hinweises (Randfall, behoben durch Übernahme
des neuen Clients). Der PWA-Browser-Audit prüft jetzt `/` statt der
(gegateten) Persona-Routen.

Zweitens ist das README konsumenten-orientiert umgebaut („Erste Schritte" =
Storybook + Scaffold, neuer Abschnitt „Lokal starten" mit `dev:api`/`dev` und
Bootstrap-Token; Troubleshooting → `CONTRIBUTING.md`). README propagiert per
`merge` und kann in angepassten Konsumenten Review-Konflikte erzeugen —
deshalb `updateMode: review`.
