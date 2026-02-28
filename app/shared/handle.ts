/**
 * Sanitizes a raw seo_keyword handle:
 * - Removes Unicode apostrophe-like characters silently
 *   so "vʼyetnamky" → "vyetnamky" (not "v-yetnamky")
 * - Normalizes NFD and strips combining diacritical marks
 * - Removes any remaining non-ASCII / non-URL-safe characters
 * - Collapses multiple hyphens
 */
export function sanitizeHandle(handle: string): string {
  return handle
    .replace(/[\u02BC\u2019\u2018\u0060\u00B4\u02B9\u02BB\u02BD\u02BE\u02BF]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
