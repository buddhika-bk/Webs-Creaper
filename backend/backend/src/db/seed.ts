import { env } from '../config/env';
import { one, pool, run } from './pool';
import { uuid } from '../lib/crypto';
import { hashPassword } from '../modules/auth/password';

/** Creates the first workspace and its owner. Idempotent. Change the seeded password immediately after first sign-in. */
async function main() {
  const existing = await one('SELECT id FROM users WHERE email = ?', [env.SEED_OWNER_EMAIL.toLowerCase()]);
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('Owner already exists - nothing to do.');
  } else {
    const wid = uuid();
    await run('INSERT INTO workspaces (id, name) VALUES (?,?)', [wid, env.SEED_WORKSPACE_NAME]);
    await run('INSERT INTO users (id, workspace_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)', [
      uuid(), wid, env.SEED_OWNER_EMAIL.toLowerCase(), env.SEED_OWNER_NAME, await hashPassword(env.SEED_OWNER_PASSWORD), 'owner',
    ]);
    // eslint-disable-next-line no-console
    console.log(`Created workspace "${env.SEED_WORKSPACE_NAME}" with owner ${env.SEED_OWNER_EMAIL}`);
  }
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
