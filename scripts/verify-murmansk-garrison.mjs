import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log("1. Navigating to http://127.0.0.1:3100...");
  await page.goto("http://127.0.0.1:3100", { waitUntil: "networkidle" });

  const hasEconomy = await page.$(".national-economy-bar");
  if (!hasEconomy) {
    console.log("Starting Norway campaign session...");
    await page.getByLabel(/1983: Able Archer/i).check();
    await page.getByLabel(/Norway NATO/i).check();
    await page.getByRole("button", { name: "Begin campaign" }).click();
    await page.waitForSelector(".national-economy-bar");
    await page.waitForTimeout(1000);
  }

  // Query campaign hex-grid API to inspect Kola and Polyarny formations directly
  const response = await page.evaluate(async () => {
    const res = await fetch("/api/v1/campaigns/current/hex-grid");
    return res.json();
  });

  const kolaHex = response.hexCells?.find((h) => h.id === "hex-sov-kola");
  const polyarnyHex = response.hexCells?.find(
    (h) => h.id === "hex-sov-polyarny",
  );

  const kolaFormations =
    response.formations?.filter((f) => f.hexId === "hex-sov-kola") ?? [];
  const polyarnyFormations =
    response.formations?.filter((f) => f.hexId === "hex-sov-polyarny") ?? [];

  console.log("=== KOLA BASTION FORMATIONS ===");
  console.log("Kola Hex:", kolaHex?.name);
  console.log("Kola Formations Count:", kolaFormations.length);
  for (const f of kolaFormations) {
    console.log(
      ` - [${f.unitType}] ${f.name} (Flagship: ${f.composition?.flagshipName || "N/A"})`,
    );
  }

  console.log("\n=== POLYARNY SUBMARINE BASE FORMATIONS ===");
  console.log("Polyarny Hex:", polyarnyHex?.name);
  console.log("Polyarny Formations Count:", polyarnyFormations.length);
  for (const f of polyarnyFormations) {
    console.log(
      ` - [${f.unitType}] ${f.name} (Flagship: ${f.composition?.flagshipName || "N/A"})`,
    );
  }

  await page.screenshot({ path: "artifacts/qa-murmansk-kola-garrison.png" });
  console.log("\nScreenshot saved to artifacts/qa-murmansk-kola-garrison.png");
  await browser.close();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
