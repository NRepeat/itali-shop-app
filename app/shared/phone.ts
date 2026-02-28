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

/**
 * Converts to E.164 and validates as a Ukrainian phone number (+380XXXXXXXXX).
 * Returns null for numbers that don't conform — e.g. "+38 (771)..." which
 * strips to "+387..." (Bosnia country code) due to missing trunk zero.
 */
export function toUkrainianE164(phone: string | null | undefined): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  return /^\+380\d{9}$/.test(e164) ? e164 : null;
}
