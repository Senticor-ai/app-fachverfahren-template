// public-sector-sdk/clock — die zwei deterministischen Seams der Domain-Logik, nominal benannt.
//
// Reine Domain-Funktionen dürfen weder `new Date()` noch eine Zufalls-/Id-Quelle direkt lesen (sonst sind sie nicht
// pinnbar/testbar). Statt drei divergenter, anonymer `() => string`-Parameter (now/newId/newAuditId) trägt der Code
// jetzt zwei benannte Aliase — eine Wahrheit für „Zeit hereinreichen" und „Id hereinreichen". Framework-neutral,
// node-types-frei; der Aufrufer (Server/Adapter) reicht die echte Quelle herein, der Test einen festen Wert.

/** Liefert einen ISO-8601-Zeitstempel. Default in PROD: `() => new Date().toISOString()`; im Test ein fester Wert. */
export type Clock = () => string;

/** Liefert eine neue, eindeutige Id (Audit-Event-Id, Fall-Id, …). Default in PROD: `randomUUID`; im Test deterministisch. */
export type IdGenerator = () => string;
