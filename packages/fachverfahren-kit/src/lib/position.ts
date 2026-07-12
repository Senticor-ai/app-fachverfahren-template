import { generateKeyBetween } from "fractional-indexing";

/**
 * Fractional rank for card/column ordering under drag-and-drop — mirrors
 * `packages/app-store-postgres/src/position.ts` on the server (kanban plan
 * decision 12). `before`/`after` are the neighboring `positionKey`s, or
 * `null` at either end of the list.
 */
export function nextPositionKey(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before ?? undefined, after ?? undefined);
}
