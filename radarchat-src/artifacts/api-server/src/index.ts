import { createServer } from "node:http";
import app from "./app";
import { setupWebSocket } from "./lib/ws";
import { logger } from "./lib/logger";
import { startSeeder } from "./lib/seeder";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocket(server);
startSeeder();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error starting server");
  process.exit(1);
});
