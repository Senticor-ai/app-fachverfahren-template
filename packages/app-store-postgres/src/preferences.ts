import type { UserPreferences } from "./app-store.js";

export function createDefaultUserPreferences(
  actorId: string,
  tenantId: string,
  updatedAt = new Date().toISOString(),
): UserPreferences {
  return {
    actorId,
    tenantId,
    colorScheme: "light",
    accessibility: {
      highContrast: false,
      largeText: false,
      reducedMotion: false,
      reducedDensity: false,
    },
    navigation: {
      sidebarAutoExpand: true,
    },
    updatedAt,
  };
}
