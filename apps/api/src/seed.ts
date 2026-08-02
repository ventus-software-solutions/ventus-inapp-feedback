import { Pool } from "pg";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiConfiguration } from "./config.js";

export const seedConfiguredProjects = async (
  databaseUrl: string,
  projects: Array<{
    workspaceId: string;
    projectId: string;
    allowedOrigins: string[];
  }>,
): Promise<void> => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const project of projects) {
      await client.query(
        "INSERT INTO workspaces(id,slug,name) VALUES($1,$1,$1) ON CONFLICT(id) DO NOTHING",
        [project.workspaceId],
      );
      await client.query(
        `INSERT INTO projects(id,workspace_id,slug,name,allowed_origins)
         VALUES($1,$2,$1,$1,$3)
         ON CONFLICT(id) DO UPDATE SET allowed_origins=excluded.allowed_origins`,
        [project.projectId, project.workspaceId, project.allowedOrigins],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
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
    throw new Error("VENTUS_DATABASE_URL is required for seed data.");
  const projects = [
    ...new Map(
      Object.values(configuration.projectKeys).map((project) => [
        `${project.workspaceId}:${project.projectId}`,
        project,
      ]),
    ).values(),
  ];
  await seedConfiguredProjects(configuration.databaseUrl, projects);
}
