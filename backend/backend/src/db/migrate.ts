import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

/** Applies SQL files in database/migrations in order. Uses a dedicated connection that allows multi statements. */
async function main() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))',
  );
  const dir = path.resolve(__dirname, '../../database/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const [applied] = await conn.query('SELECT name FROM schema_migrations');
  const done = new Set((applied as { name: string }[]).map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    // eslint-disable-next-line no-console
    console.log(`Applying ${file} ...`);
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
  }
  // eslint-disable-next-line no-console
  console.log('Migrations complete.');
  await conn.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
