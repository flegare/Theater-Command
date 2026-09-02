import { chromium } from "@playwright/test";

async function runQA() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log("1. Navigating to http://127.0.0.1:3100...");
  await page.goto("http://127.0.0.1:3100");
  await page.waitForLoadState("networkidle");

  console.log("2. Selecting Norway campaign...");
  await page.getByLabel(/1983: Able Archer/i).check();
  await page.getByLabel(/Norway NATO/i).check();
  await page.getByRole("button", { name: "Begin campaign" }).click();
  await page.waitForSelector(".national-economy-bar");
  await page.waitForTimeout(1000);

  console.log("3. Opening Surplus Market Modal...");
  await page.getByRole("button", { name: /Surplus Market/i }).click();
  await page.waitForSelector(".recruitment-modal");
  await page.screenshot({ path: "artifacts/qa-market-modal.png" });
  console.log("  -> Captured artifacts/qa-market-modal.png");

  console.log("4. Closing market and opening Diplomatic Treaties Modal...");
  await page.locator(".recruitment-modal-close").click();
  await page.getByRole("button", { name: /Treaties/i }).click();
  await page.waitForSelector(".recruitment-modal");
  await page.screenshot({ path: "artifacts/qa-treaties-modal.png" });
  console.log("  -> Captured artifacts/qa-treaties-modal.png");

  console.log("5. Closing treaties modal and clicking on Bergen hex...");
  await page.locator(".recruitment-modal-close").click();

  await page.evaluate(() => {
    window.__leafletMap?.setView([60.39, 5.32], 6);
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__leafletMap?.fire("click", {
      latlng: window.L.latLng(60.39, 5.32),
      containerPoint: window.__leafletMap.latLngToContainerPoint([60.39, 5.32]),
      layerPoint: window.__leafletMap.latLngToLayerPoint([60.39, 5.32]),
      originalEvent: { target: null },
    });
  });

  await page.waitForSelector(".hex-tactical-popup");
  await page.screenshot({ path: "artifacts/qa-hex-popup.png" });
  console.log("  -> Captured artifacts/qa-hex-popup.png");

  const upgradeBtn = page.locator(".hex-popup-investment button");
  if (await upgradeBtn.isVisible()) {
    console.log("6. Clicking Upgrade Investment Button...");
    await upgradeBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "artifacts/qa-hex-upgraded.png" });
    console.log("  -> Captured artifacts/qa-hex-upgraded.png");
  }

  await browser.close();
  console.log("QA Visual Check Complete!");
}

runQA().catch((err) => {
  console.error("QA script failed:", err);
  process.exit(1);
});
