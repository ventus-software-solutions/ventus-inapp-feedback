import { loadApiConfiguration } from "./config.js";
import { runMigrations } from "./migrate.js";
import { MemoryFeedbackRepository } from "./memoryRepository.js";
import { PostgresFeedbackRepository } from "./postgresRepository.js";
import { seedConfiguredProjects } from "./seed.js";
import { S3ObjectStorage } from "./objectStorage.js";
import { buildApiServer } from "./server.js";

const configuration = loadApiConfiguration();
if (configuration.databaseUrl && configuration.autoMigrate) {
  await runMigrations(configuration.databaseUrl);
}
if (configuration.databaseUrl && configuration.autoSeedConfiguredProjects) {
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
const repository = configuration.databaseUrl
  ? new PostgresFeedbackRepository(
      configuration.databaseUrl,
      configuration.databasePoolSize,
    )
  : new MemoryFeedbackRepository();
const objectStorage = configuration.attachments.bucket
  ? new S3ObjectStorage(configuration.attachments.bucket, {
      region: configuration.attachments.region,
      ...(configuration.attachments.endpoint
        ? { endpoint: configuration.attachments.endpoint }
        : {}),
      ...(configuration.attachments.publicEndpoint
        ? { publicEndpoint: configuration.attachments.publicEndpoint }
        : {}),
      ...(configuration.attachments.accessKeyId
        ? { accessKeyId: configuration.attachments.accessKeyId }
        : {}),
      ...(configuration.attachments.secretAccessKey
        ? { secretAccessKey: configuration.attachments.secretAccessKey }
        : {}),
      forcePathStyle: configuration.attachments.forcePathStyle,
      serverSideEncryption: configuration.attachments.serverSideEncryption,
    })
  : undefined;
if (objectStorage && configuration.attachments.autoCreateBucket) {
  await objectStorage.ensureBucket();
}
const server = buildApiServer({
  configuration,
  repository,
  ...(objectStorage ? { objectStorage } : {}),
});

const shutdown = async (signal: string): Promise<void> => {
  server.log.info({ signal }, "shutting down");
  await server.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await server.listen({ host: configuration.host, port: configuration.port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
