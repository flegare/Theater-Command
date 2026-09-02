import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/infrastructure/config.js";

describe("loadConfig", () => {
  it("uses local-first defaults", () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3100,
      databasePath: "./data/theater-campaign.sqlite",
      ollamaUrl: "http://127.0.0.1:11434",
      godModeEnabled: false,
    });
  });

  it("rejects an invalid port before startup", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow(
      "Invalid application configuration",
    );
  });
});
