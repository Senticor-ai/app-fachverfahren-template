// store-compat — TYP-Ebene: die Wire-DTOs (app-bff-contracts) müssen die Store-Formen
// (app-store-postgres) deckungsgleich abbilden — Drift fällt beim tsc-Build dieses
// Pakets auf, nicht erst zur Laufzeit. (expectTypeOf-Fehler brechen die Kompilierung.)
import { describe, expectTypeOf, it } from "vitest";
import type {
  UserPreferencesDto,
  UserPreferencesUpdateDto,
} from "@senticor/app-bff-contracts";
import type {
  UserPreferences,
  UserPreferencesUpdate,
} from "@senticor/app-store-postgres";

describe("DTO ≡ Store-Typen", () => {
  it("UserPreferences: DTO und Store-Form sind in beide Richtungen zuweisbar", () => {
    expectTypeOf<UserPreferences>().toExtend<UserPreferencesDto>();
    expectTypeOf<UserPreferencesDto>().toExtend<UserPreferences>();
  });

  it("UserPreferencesUpdate: das validierte Update passt in die Store-Signatur", () => {
    expectTypeOf<UserPreferencesUpdateDto>().toExtend<UserPreferencesUpdate>();
  });
});
