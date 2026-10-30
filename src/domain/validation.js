/**
 * Validation and normalization helpers.
 */

/**
 * Normalizes a SKU according to Section 3.5:
 * - Read as string, never numeric.
 * - Preserve leading zeros.
 * - Preserve hyphens and exact case.
 * - Trim only accidental whitespace at start/end.
 */
export function normalizeSku(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim();
}

/**
 * Validates if a quantity input is a valid non-negative integer.
 */
export function isValidQuantity(val) {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  return Number.isInteger(num) && num >= 0 && Number.isFinite(num);
}

/**
 * Formats a numeric amount to Bangladesh Taka currency string.
 */
export function formatCurrency(amount, currency = 'BDT') {
  const num = Number(amount) || 0;
  const sign = num < 0 ? '-' : '';
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  if (currency === 'BDT' || currency === '৳') {
    return `${sign}৳${absFormatted}`;
  }
  return `${sign}${currency} ${absFormatted}`;
}

/**
 * Formats a date/timestamp to standard Walkway display format: DD-MM-YYYY HH:mm.
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${mins}`;
}

