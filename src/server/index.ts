import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "../infrastructure/config.js";
import { openDatabase } from "../infrastructure/database.js";
import { migrateDatabase } from "../infrastructure/migrations.js";

const config = loadConfig(process.env);
const database = openDatabase(config);
migrateDatabase(database);
const app = createApp(config, { database });
const server = createServer(app);

server.listen(config.port, config.host, () => {
  console.log(
    `Sea Power Theater Command listening at http://${config.host}:${config.port}`,
  );
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing server.`);
  server.close((error) => {
    database.close();
    if (error) {
      console.error("Server shutdown failed.", error);
      process.exitCode = 1;
      return;
    }
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
