import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './helpers/database.js';

test('reusable no-dues calculation handles every mandatory resolution combination', async () => {
  const db = await createTestDatabase();
  try {
    for (let total = 0; total <= 6; total++) {
      for (let resolved = 0; resolved <= total; resolved++) {
        const { rows } = await db.query('SELECT calculate_no_dues_overall($1,$2) AS status', [total, resolved]);
        assert.equal(rows[0].status, total === 0 ? 'not_configured' : total === resolved ? 'cleared' : 'incomplete');
      }
    }
    for (const counts of [[null, 0], [1, null], [-1, 0], [1, -1], [1, 2]]) {
      await assert.rejects(db.query('SELECT calculate_no_dues_overall($1,$2)', counts), error => error.code === '23514');
    }
  } finally { await db.close(); }
});

test('PostgreSQL configurable no-dues, statements, progress and authorization suite', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(await readFile(new URL('../supabase/tests/no_dues.sql', import.meta.url), 'utf8'));
  } finally { await db.close(); }
});
