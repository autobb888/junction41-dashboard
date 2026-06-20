/**
 * Safe date helpers — guard against missing/invalid/malformed values so the UI
 * never renders "Invalid Date" or "NaN day ago".
 */

/**
 * Does the ISO-ish string already carry a timezone designator?
 * Matches a trailing "Z" or a "+hh:mm" / "-hh:mm" offset.
 */
function hasTimezone(s) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
}

/**
 * Parse a value into a valid Date, or return null.
 * For naive timestamp strings (no timezone) we assume UTC by appending 'Z',
 * since backend timestamps are UTC. Strings that already carry a tz are left
 * untouched (appending 'Z' would corrupt them).
 */
export function parseDate(value) {
  if (value == null || value === '') return null;
  let d;
  if (typeof value === 'string' && hasTimezone(value) === false) {
    d = new Date(`${value}Z`);
  } else {
    d = new Date(value);
  }
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a value with toLocaleString(), or return the fallback if invalid.
 */
export function formatDateTime(value, fallback = 'Unknown') {
  const d = parseDate(value);
  return d ? d.toLocaleString() : fallback;
}

/**
 * Format a value with toLocaleDateString(), or return the fallback if invalid.
 */
export function formatDate(value, fallback = 'Unknown') {
  const d = parseDate(value);
  return d ? d.toLocaleDateString() : fallback;
}

/**
 * Seconds elapsed since the given value (UTC-aware), or null if invalid.
 */
export function secondsAgo(value) {
  const d = parseDate(value);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

/**
 * Format a date-only string ("YYYY-MM-DD") for display without UTC off-by-one.
 * Plain Date("YYYY-MM-DD") parses as UTC midnight; rendering in local time can
 * shift the displayed day. We parse the components as LOCAL instead.
 */
export function parseLocalDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const out = new Date(y, m - 1, d);
    return isNaN(out.getTime()) ? null : out;
  }
  return parseDate(value);
}
