// error — der EINE Fehler-Envelope der BFF-Routen: { error, requestId? }. Bewusst
// kompatibel zur bestehenden App-Fehlerform ({ error: string } in /auth/* und
// /api/v1/*), damit Clients nur EINE Form parsen.
import { Type, type Static } from "@sinclair/typebox";

export const ErrorEnvelopeSchema = Type.Object(
  {
    error: Type.String({ minLength: 1 }),
    requestId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;
