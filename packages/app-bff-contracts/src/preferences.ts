// preferences — DTOs für GET/PUT /api/preferences. Die Formen spiegeln
// UserPreferences/UserPreferencesUpdate aus @senticor/app-store-postgres
// (Kompatibilität wird dort typseitig gegengeprüft, store-compat.test.ts im
// BFF-Paket). tenantId/actorId kommen IMMER aus der Sitzung — das Update-Schema
// akzeptiert sie deshalb nicht (additionalProperties: false; Fastifys Ajv strippt
// unbekannte Felder, Value.Check weist sie ab).
import { Type, type Static } from "@sinclair/typebox";

export const ColorSchemeSchema = Type.Union([
  Type.Literal("light"),
  Type.Literal("dark"),
  Type.Literal("system"),
]);

export const AccessibilityPreferencesSchema = Type.Object(
  {
    highContrast: Type.Boolean(),
    largeText: Type.Boolean(),
    reducedMotion: Type.Boolean(),
    reducedDensity: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const NavigationPreferencesSchema = Type.Object(
  {
    sidebarAutoExpand: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const UserPreferencesDtoSchema = Type.Object(
  {
    actorId: Type.String({ minLength: 1 }),
    tenantId: Type.String({ minLength: 1 }),
    colorScheme: ColorSchemeSchema,
    accessibility: AccessibilityPreferencesSchema,
    navigation: NavigationPreferencesSchema,
    updatedAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type UserPreferencesDto = Static<typeof UserPreferencesDtoSchema>;

export const UserPreferencesUpdateSchema = Type.Object(
  {
    colorScheme: Type.Optional(ColorSchemeSchema),
    accessibility: Type.Optional(Type.Partial(AccessibilityPreferencesSchema)),
    navigation: Type.Optional(Type.Partial(NavigationPreferencesSchema)),
  },
  { additionalProperties: false },
);

export type UserPreferencesUpdateDto = Static<
  typeof UserPreferencesUpdateSchema
>;
