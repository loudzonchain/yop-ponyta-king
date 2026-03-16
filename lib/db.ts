import { Pool } from "pg";

declare global {
  var __yopPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing DATABASE_URL.");
  }

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } as any
  });
  ```
}

export function getPool() {
  if (!global.__yopPool) {
    global.__yopPool = createPool();
  }

  return global.__yopPool;
}
