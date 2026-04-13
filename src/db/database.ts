import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!hasDatabase()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return pool;
}

export async function queryRows<T>(text: string, values: unknown[] = []) {
  const db = getPool();
  if (!db) {
    return null;
  }

  const result = await db.query<T>(text, values);
  return result.rows;
}

export async function queryRow<T>(text: string, values: unknown[] = []) {
  const rows = await queryRows<T>(text, values);
  return rows?.[0] ?? null;
}

export async function execute(text: string, values: unknown[] = []) {
  const db = getPool();
  if (!db) {
    return null;
  }

  return db.query(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const db = getPool();
  if (!db) {
    return null;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
