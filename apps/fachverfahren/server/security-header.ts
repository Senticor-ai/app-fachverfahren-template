// security-header.ts — DIE HTTP-SICHERHEITS-HEADER, die der Golden verlangt.
//
// ⛔ GEMESSEN 2026-09-07: dieser Server setzte KEINEN einzigen davon. Kein CSP, kein HSTS, kein
// X-Frame-Options, kein nosniff; `@fastify/helmet` liegt weder in `package.json` noch im Lockfile. Der
// kuratierte Golden `arch:golden-security-header` verlangt sie ausdrücklich REAL IM CODE, und die
// Verfassung führt `security-headers` als `blocking: true, severity: hart-immer` — es hat nur nie jemand
// geprüft (die Regel steht bis heute in `UNGEDECKTE_SCHULD`). Grün durch Abwesenheit eines Prüfers.
//
// ⭐ KEINE NEUE ABHÄNGIGKEIT. Der Golden sagt «am einfachsten via helmet» — die FORDERUNG sind die
// Header, nicht das Paket. Ein neues Fremdpaket in einem Verwaltungsverfahren ist eine Lieferketten-
// Flanke, die hier nichts kauft: dieselben Header setzt der Framework-eigene Hook in zwanzig Zeilen.
//
// ⛔ UND WAS HIER BEWUSST NICHT STEHT, IST DER WICHTIGERE TEIL — der Golden schließt mit dem Satz
// «ein Dossier darf eine Kontrolle nur als ‚umgesetzt' führen, wenn sie im Code/Config belegbar ist
// (sonst ‚geplant') — Anti-Overclaim»:
//
//   · CSP (Content-Security-Policy) FEHLT WEITER, und zwar erklärt. Eine Richtlinie, die zur
//     ausgelieferten Oberfläche nicht passt, bricht entweder die Anwendung oder ist so weit gefasst,
//     dass sie nichts schützt — beides ist schlechter als ihr benanntes Fehlen. Sie gehört an die
//     Stelle, die die Asset-Herkunft der Oberfläche KENNT (Build/Deploy), nicht in diesen Hook.
//   · TLS terminiert am Reverse-Proxy. `Strict-Transport-Security` wird deshalb NUR gesetzt, wenn der
//     Request nachweislich sicher ankam — ein HSTS-Header auf einer Klartext-Verbindung ist eine
//     Behauptung ohne Deckung und macht die erste Verbindung nicht sicherer.
import type { FastifyInstance } from "fastify";

/** Die Header, die ohne Kenntnis der Asset-Herkunft belegbar richtig sind. */
export const SICHERE_HEADER: Readonly<Record<string, string>> = Object.freeze({
  // Kein MIME-Sniffing: ein hochgeladener Nachweis darf nie als Skript ausgeführt werden.
  "X-Content-Type-Options": "nosniff",
  // Keine Einbettung: dieses Verfahren wird nirgends geframt — Clickjacking hat damit keine Fläche.
  "X-Frame-Options": "DENY",
  // Keine Vorgangs-URLs (mit Aktenzeichen) an fremde Ziele.
  "Referrer-Policy": "no-referrer",
  // Keine der drei Fähigkeiten wird gebraucht; die Verweigerung ist die ehrliche Vorgabe.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

/** Wie lange HSTS gilt, wenn der Request nachweislich über TLS kam (ein Jahr, Subdomains eingeschlossen). */
export const HSTS_WERT = "max-age=31536000; includeSubDomains";

/**
 * Setzt die Header an JEDER Antwort — auch an Fehlern, denn eine 500 ist genauso einbettbar wie eine 200.
 *
 * `onSend` statt `onRequest`: erst dort steht die Antwort fest, und der Hook läuft auch für Antworten,
 * die ein Fehlerhandler erzeugt hat.
 */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    for (const [k, v] of Object.entries(SICHERE_HEADER)) reply.header(k, v);
    // ⛔ NUR bei belegter TLS-Strecke. `request.protocol` folgt `x-forwarded-proto`, wenn der Server
    // `trustProxy` führt — sonst bleibt es `http`, und dann ist Schweigen die richtige Antwort.
    if (request.protocol === "https")
      reply.header("Strict-Transport-Security", HSTS_WERT);
    return payload;
  });
}
