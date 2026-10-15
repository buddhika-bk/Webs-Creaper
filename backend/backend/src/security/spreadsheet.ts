/**
 * Spreadsheet formula-injection protection. Cells that Excel could interpret as formulas
 * are prefixed with an apostrophe so they are always treated as text.
 */
const NUMBER_LIKE = /^[+-]?[\d\s().-]+$/; // phone numbers and plain numbers stay readable

export function safeCell<T>(value: T): T | string {
  if (typeof value !== 'string') return value;
  const v = value.replace(/\u0000/g, '');
  if (v.length === 0) return v;
  const first = v[0];
  if (first === '=' || first === '@' || first === '\t' || first === '\r' || first === '\n') return `'${v}`;
  if ((first === '+' || first === '-') && !NUMBER_LIKE.test(v)) return `'${v}`;
  return v;
}
