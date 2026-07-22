// kalender — die EINE Wahrheit für kalendergenaue Monats-Arithmetik (UTC), geteilt von allen
// server-autoritativen Fristberechnungen (Rechtsbehelfs-Frist, Aufbewahrungsfrist). Rein, deterministisch,
// kein Date.now. Bewusst zentral: divergierende Monats-Arithmetik an mehreren Stellen wäre genau die
// Fehlerquelle, die eine Frist mal um einen Tag verschiebt.

/** Addiert `n` Kalendermonate (UTC) mit Monatsende-Klemmung: 31.01. + 1 Monat → 28./29.02. (nicht 03.03.).
 *  Mutiert `d` in place. Zuerst auf den 1. setzen verhindert den Monatsüberlauf, dann auf den geklemmten Tag. */
export function addKalenderMonate(d: Date, n: number): void {
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const letzterTag = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(tag, letzterTag));
}
