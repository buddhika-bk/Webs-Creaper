import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  multipleStatements: false, // never allow stacked statements
});

export type Db = Pool | PoolConnection;

/** All values are passed as bound/escaped parameters. Never interpolate user input into SQL strings. */
export async function rows<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const [result] = await db.query(sql, params);
  return result as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const r = await rows<T>(sql, params, db);
  return r[0] ?? null;
}

export async function run(sql: string, params: unknown[] = [], db: Db = pool): Promise<ResultSetHeader> {
  const [result] = await db.query(sql, params);
  return result as ResultSetHeader;
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
