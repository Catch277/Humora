/**
 * Search key for accent-insensitive matching: lowercase without diacritics, so a query typed without
 * tone marks ("nguyen thi minh khai") still matches the stored name ("Nguyễn Thị Minh Khai").
 *
 * `đ` is a letter of its own — NFD does not decompose it — hence the explicit replacement. Nothing
 * else is transliterated: the point is to let a *typed* query match a *stored* name, not to produce a
 * canonical form worth persisting.
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}
