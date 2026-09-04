import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:3100...");
  await page.goto("http://127.0.0.1:3100");
  await page.waitForLoadState("networkidle");

  const beginBtn = page.getByRole("button", { name: /Begin campaign/i });
  if (await beginBtn.isVisible()) {
    console.log("Starting campaign as Norway...");
    const norwayRadio = page.getByLabel(/Norway NATO/i);
    if (await norwayRadio.isVisible()) await norwayRadio.check();
    await beginBtn.click();
    await page.waitForSelector(".national-economy-bar", { timeout: 10000 });
  }

  await page.waitForTimeout(1000);

  // Click on a formation counter on the map to trigger popup
  console.log("Clicking map counter...");
  const counter = page.locator(".formation-map-counter").first();
  if (await counter.isVisible()) {
    await counter.click();
    await page.waitForTimeout(800);
  }

  // Click the tactical battle button in popup
  console.log("Opening Tactical Engagement modal...");
  const battleBtn = page
    .locator(".custom-sector-popup button.sp-battle")
    .first();
  if (await battleBtn.isVisible()) {
    await battleBtn.click();
    await page.waitForSelector(".tactical-engagement-modal", { timeout: 6000 });
    console.log("TacticalEngagementModal is OPEN!");

    // Capture Mode A: Sea Power Mission (.ini)
    await page.screenshot({
      path: "artifacts/visual-audit/qa-tactical-engagement-mode-a.png",
    });

    // Expand preview
    const previewSummary = page.locator(
      "summary:has-text('Preview Generated .ini')",
    );
    if (await previewSummary.isVisible()) {
      await previewSummary.click();
      await page.waitForTimeout(500);
    }

    // Switch to Mode B: Auto-Resolve
    const autoResolveTab = page.locator(
      "button:has-text('Mode B: Instant Auto-Resolve')",
    );
    if (await autoResolveTab.isVisible()) {
      await autoResolveTab.click();
      await page.waitForTimeout(600);
      console.log("Mode B active, clicking simulation button...");
      const simBtn = page.locator(
        "button:has-text('Run Instant Auto-Resolve Simulation')",
      );
      if (await simBtn.isVisible()) {
        await simBtn.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({
        path: "artifacts/visual-audit/qa-tactical-engagement-autoresolved.png",
      });
    }
  }

  await browser.close();
  console.log("Comprehensive QA run completed!");
}

run().catch((err) => {
  console.error("QA error:", err);
  process.exit(1);
});
