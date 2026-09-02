import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inTransaction,
  openDatabase,
  type CampaignDatabase,
} from "../../src/infrastructure/database.js";

describe("campaign database", () => {
  let database: CampaignDatabase | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    database?.close();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
    database = undefined;
    directory = undefined;
  });

  it("enables integrity pragmas and isolates sequential transactions", async () => {
    directory = await mkdtemp(join(tmpdir(), "theater-campaign-"));
    database = openDatabase({ databasePath: join(directory, "state.sqlite") });
    database.exec(
      "CREATE TABLE resources (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)",
    );

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");

    expect(() =>
      inTransaction(database!, () => {
        database!.prepare("INSERT INTO resources (amount) VALUES (?)").run(25);
        throw new Error("abort campaign turn");
      }),
    ).toThrow("abort campaign turn");

    inTransaction(database, () => {
      database!.prepare("INSERT INTO resources (amount) VALUES (?)").run(50);
    });
    inTransaction(database, () => {
      database!.prepare("INSERT INTO resources (amount) VALUES (?)").run(75);
    });

    const rows = database
      .prepare("SELECT amount FROM resources ORDER BY id")
      .all() as Array<{ amount: number }>;
    expect(rows).toEqual([{ amount: 50 }, { amount: 75 }]);
  });
});
