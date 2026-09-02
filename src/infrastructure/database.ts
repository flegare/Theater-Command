import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { AppConfig } from "./config.js";

export type CampaignDatabase = Database.Database;

export function openDatabase(
  config: Pick<AppConfig, "databasePath">,
): CampaignDatabase {
  mkdirSync(dirname(config.databasePath), { recursive: true });

  const database = new Database(config.databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  return database;
}

export function inTransaction<T>(
  database: CampaignDatabase,
  operation: () => T,
): T {
  return database.transaction(operation)();
}
