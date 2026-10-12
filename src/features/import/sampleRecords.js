// Fictional, non-sensitive demonstration records; never a database fallback.
export const SAMPLE_VALID_ROWS = Object.freeze([
  ['006', 'Demo Student Six', 'six@example.test', 'CSE', 2027, 8.5, '+91 90000 00006', 0],
  ['007', 'Demo Student Seven', 'seven@example.test', 'ECE', 2028, 9, '', 1],
]);
export const SAMPLE_INVALID_ROWS = Object.freeze([
  SAMPLE_VALID_ROWS[0],
  ['', 'Demo Missing Roll', 'missing@example.test', 'ECE', 2027, 7.2, '', 1],
  ['007', 'Demo Bad Email', 'bad-email', 'CSE', 2027, 8, '', 0],
  ['008', 'Demo Duplicate One', 'eight@example.test', 'ECE', 2027, 9, '', 0],
  ['008', 'Demo Duplicate Two', 'another-eight@example.test', 'ECE', 2027, 8.8, '', 0],
  ['001', 'Demo Existing Roll', 'existing@example.test', 'CSE', 2027, 8, '', 0],
]);
