---
bump: patch
updateMode: auto
migration: none
---

# Härtung: kollisionssicherer Trenner in der Governance-Derivation

`abgeleiteteTransitions` (Governance-Opt-in) matcht die `zusaetzlicheVierAugen`-Einträge
über einen Transitions-Schlüssel `from<TRENNER>to`. Der Trenner ist jetzt `U+0000` statt
eines Leerzeichens: mit einem Leerzeichen hätten zwei verschiedene `from→to`-Paare
denselben Schlüssel erzeugen können (z. B. `"x"→"y z"` und `"x y"→"z"` beide `"x y z"`),
sodass EIN Opt-in versehentlich die falsche Transition Vier-Augen-pflichtig gemacht hätte.
Status-Schlüssel sind normalerweise slug-artig (kein Risiko), aber generierbare Configs
können ungewöhnliche Schlüssel tragen — und Governance ist sicherheitsrelevant.

Reine interne Match-Härtung, verhaltensgleich für reale Configs; der Contract bleibt
byte-identisch. Regressions-Test mit kollidierenden Leerzeichen-Schlüsseln ergänzt.
