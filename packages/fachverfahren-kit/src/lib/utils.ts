// fachverfahren-kit/lib/utils — shadcn-Standard-`cn` (clsx + tailwind-merge), wie in der Referenz-UX.
// EINE Quelle der Wahrheit; ../lib/cn re-exportiert von hier, damit es genau einen Helfer gibt.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Führt bedingte Klassen zusammen und löst Tailwind-Konflikte deterministisch auf. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
