import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:3100...");
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

  // Query campaign hex-grid API to inspect Sweden and Finland formations directly
  const response = await page.evaluate(async () => {
    const res = await fetch("/api/v1/campaigns/current/hex-grid");
    return res.json();
  });

  console.log("\n=== SWEDISH ARMED FORCES ===");
  const sweFormations = response.formations?.filter((f) => f.countryId === "sweden") ?? [];
  console.log(`Total Swedish Formations: ${sweFormations.length}`);
  for (const f of sweFormations) {
    const hex = response.hexCells?.find((h) => h.id === f.hexId);
    console.log(` - [${f.unitType}] ${f.name} @ ${hex?.name || f.hexId} (Flagship: ${f.composition?.flagshipName || "N/A"})`);
  }

  console.log("\n=== FINNISH DEFENSE FORCES ===");
  const finFormations = response.formations?.filter((f) => f.countryId === "finland") ?? [];
  console.log(`Total Finnish Formations: ${finFormations.length}`);
  for (const f of finFormations) {
    const hex = response.hexCells?.find((h) => h.id === f.hexId);
    console.log(` - [${f.unitType}] ${f.name} @ ${hex?.name || f.hexId} (Flagship: ${f.composition?.flagshipName || "N/A"})`);
  }

  await page.screenshot({ path: "artifacts/qa-finland-sweden-garrisons.png" });
  console.log("\nScreenshot saved to artifacts/qa-finland-sweden-garrisons.png");
  await browser.close();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
