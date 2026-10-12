/**
 * CSV safety helpers for spreadsheet exports
 * Neutralize formula injection: prefix ' for = + - @, tab, CR at start.
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return ''
  // Numeric/boolean inputs remain typed values rather than formula-like text.
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const s = String(value)
  if (!s) return ''
  if (/^\s*[=+\-@]/u.test(s) || /^[ \f\v]*[\t\r]/u.test(s)) {
    return "'" + s
  }
  return s
}

export function escapeCsvField(value) {
  let s = sanitizeCsvCell(value)
  // Escape quotes by doubling, wrap in quotes if contains comma/newline/quote
  if (s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function toCsvRow(values) {
  return values.map(escapeCsvField).join(',') + '\r\n'
}
