// behoerden-identitaet — die ANZEIGE-Identität der erlassenden Behörde (Phase 5, W5 / Audit-Befund M3).
//
// § 119 Abs. 3 Satz 1 AO: „Ein schriftlich oder elektronisch erlassener Verwaltungsakt muss die erlassende
// Behörde erkennen lassen." § 125 Abs. 2 Nr. 1 AO: ein VA, der sie nicht erkennen lässt, ist NICHTIG.
// Vor Phase 5 reichte das BFF die TECHNISCHE `authorityId` durch — im Default-Deployment stand im Briefkopf
// und in den PDF-Metadaten wörtlich „default".
//
// WICHTIG: die Identität wird beim ERLASS in den Verwaltungsakt EINGEFROREN, nicht beim Abruf angehängt. Sie
// ist Bestandteil des VA (nicht seiner Darstellung), und nur so deckt der SHA-256 über die kanonischen Bytes
// sie mit ab — würde sie erst beim Lesen ergänzt, schlüge die Re-Hash-Prüfung des Bürgers fehl und der
// Beweiswert des Bescheids wäre zerstört.
export type BehoerdenIdentitaet = (
  authorityId: string,
) => { name: string; anschrift?: string } | undefined;

/**
 * Sieht dieser Behördenname wie ein TECHNISCHER SCHLÜSSEL aus (z. B. „default", „dev-authority", „auth_01")?
 *
 * Rein syntaktisch und bewusst konservativ: nur durchgehend kleingeschriebene Token ohne Leerzeichen gelten
 * als technisch — „Stadt Musterstadt" oder „Finanzamt Köln-Süd" passieren. Ein technischer Schlüssel lässt die
 * Behörde nicht erkennen; statt eine Behörde zu erfinden, wird der Bescheid als ENTWURF gekennzeichnet.
 */
export function istTechnischerSchluessel(name: string): boolean {
  const t = name.trim();
  return t.length === 0 || /^[a-z0-9][a-z0-9._:-]*$/.test(t);
}

/** Die geprüfte Anzeige-Identität — `undefined`, wenn keine oder nur eine technische vorliegt. */
export function anzeigeIdentitaet(
  port: BehoerdenIdentitaet | undefined,
  authorityId: string,
): { name: string; anschrift?: string } | undefined {
  const i = port?.(authorityId);
  return i && !istTechnischerSchluessel(i.name) ? i : undefined;
}
