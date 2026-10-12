import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './helpers/database.js';

test('PostgreSQL recruitment migration and SQL authorization/invariant suite', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(await readFile(new URL('../supabase/tests/recruitment.sql', import.meta.url), 'utf8'));
  } finally {
    await db.close();
  }
});
