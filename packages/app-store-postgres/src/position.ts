import { generateKeyBetween } from "fractional-indexing";

/**
 * Fractional rank for ordering cards/columns under concurrent drag-and-drop
 * (kanban plan decision 12) — sorts lexicographically, `before`/`after` are
 * the neighboring `position_key`s (or `null` at either end of the list).
 */
export function nextPositionKey(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before ?? undefined, after ?? undefined);
}
