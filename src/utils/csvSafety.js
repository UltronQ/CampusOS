/**
 * CSV safety helpers for spreadsheet exports
 * Neutralize formula injection: prefix ' for = + - @, tab, CR at start.
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (!s) return ''
  const first = s[0]
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
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
