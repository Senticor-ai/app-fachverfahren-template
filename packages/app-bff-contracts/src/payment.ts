// Wire-Verträge der Zahlungs-/Gebühren-Naht (PaymentPort → ePayBL). Der Server ergänzt Währung (EUR) und
// Schuldner (debtor) AUS DER SITZUNG — der Body trägt nur den fachlichen Betrag/Zweck/die Referenz (kein
// Actor/keine Behörde erschleichbar). Alle Antwortfelder sind VOLLSTÄNDIG deklariert, sonst würfe Fastifys
// `removeAdditional` sie still weg (dieselbe Transparenz-Disziplin wie beim KI-Vorschlag).
import { Type, type Static } from "@sinclair/typebox";

/** Eine Zahlung/Gebühr für einen Vorgang veranlassen. Betrag in Minor-Units (Cent); Währung setzt der Server (EUR). */
export const PaymentCreateRequestSchema = Type.Object(
  {
    /** Betrag in kleinster Einheit (Cent), > 0. */
    amountMinor: Type.Integer({ minimum: 1 }),
    /** Verwendungszweck (fachlich, z. B. "Antragsgebühr — Verwaltungsgebühr"). */
    purpose: Type.String({ minLength: 1 }),
    /** Eindeutige fachliche Referenz (Vorgangs-/Kassenzeichen) — idempotenz-tauglich. */
    reference: Type.String({ minLength: 1 }),
    /** Optionale Rücksprung-URL nach Bezahlung (Bürgerportal). */
    returnUrl: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type PaymentCreateRequestDto = Static<typeof PaymentCreateRequestSchema>;

/** Der Zahlungsstatus (ePayBL-Roundtrip) — die einzige serverseitig autoritative Sicht auf eine Zahlung. */
export const PaymentStatusDtoSchema = Type.Object(
  {
    paymentId: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal("created"),
      Type.Literal("pending"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("refunded"),
    ]),
    amountMinor: Type.Integer({ minimum: 0 }),
    currency: Type.Literal("EUR"),
    providerReference: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type PaymentStatusDto = Static<typeof PaymentStatusDtoSchema>;
