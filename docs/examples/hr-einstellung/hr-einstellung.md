# Beispiel-Blueprint: HR-Einstellungsverfahren

Zweite Nicht-Bürger-Domäne (nach `docs/examples/beschaffung/`) — belegt, dass das Template
BELIEBIGE Fachverfahren trägt, nicht nur Bürger↔Behörde. Dasselbe Muster, andere **Daten**;
kein neuer Server-Code. Kernel-Beweis: `packages/public-sector-sdk/src/hr-blueprint.test.ts`.

## Personas (`leistung.config.personas` — disjunkt = Ersetzung)

```ts
personas: [
  { key: "fachbereich",    label: "Fachbereich",     home: "/fachbereich",    routePrefix: "/fachbereich" },
  { key: "personalstelle", label: "Personalstelle",  home: "/personal",       routePrefix: "/personal" },
  { key: "vorgesetzter",   label: "Freigabe",        home: "/freigabe",       routePrefix: "/freigabe" },
]
```

## Verfahren (`procedure.config.ts` → `ProcedureVersion`)

Zustände `beantragt → budget_pruefung → freigegeben → ausgeschrieben → im_auswahlverfahren →
besetzt` (+ `abgelehnt`). Die **Budget-Freigabe** trägt `requiresFourEyes` (dieselbe
Governance wie ein Verwaltungsakt / eine Beschaffungs-Freigabe); `besetzen` trägt
`closesCase`.

## Rollen + Daten

RBAC eigene Rollen (`personalstelle`, `vorgesetzter`) über `extendRbacRegistry`; die
fachlichen Daten (Stellenprofil, Bewerbungen, Auswahl-Vermerke) in `app_cases.data` (opak)
bzw. als Aufgaben/Vermerke. Personas = nur Navigation; Autorisierung = Server/RBAC.

## Grenzen — wie beim Beschaffungs-Blueprint

N-Augen / mehrstufige Freigabeketten (P1-4) und Positions-/Wiederhol-Formularfelder (P1-6)
sind Folge-Ausbau; heute trägt das Modell ein boolesches `requiresFourEyes`.
