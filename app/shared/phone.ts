/**
 * Converts a raw phone string to E.164 format required by Shopify.
 * Strips all non-digit characters, then prepends "+".
 * Returns null if the result has fewer than 7 digits (clearly invalid).
 *
 * Examples:
 *   "+38 (095) 891-46-95" → "+380958914695"
 *   "380958914695"        → "+380958914695"
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `+${digits}`;
}
