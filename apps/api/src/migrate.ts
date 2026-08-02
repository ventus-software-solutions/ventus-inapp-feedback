import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { loadApiConfiguration } from "./config.js";

export const runMigrations = async (databaseUrl: string): Promise<void> => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const migrationDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations",
    );
    const files = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".up.sql"))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.up\.sql$/, "");
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (exists.rowCount) continue;
      const sql = await readFile(resolve(migrationDirectory, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
          [version],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const configuration = loadApiConfiguration();
  if (!configuration.databaseUrl)
    throw new Error("VENTUS_DATABASE_URL is required for migrations.");
  await runMigrations(configuration.databaseUrl);
}
