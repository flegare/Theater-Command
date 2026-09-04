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
    console.log("Starting Able Archer 83 campaign as Norway...");
    const variantRadio = page.getByLabel(/1983: Able Archer/i);
    if (await variantRadio.isVisible()) await variantRadio.check();
    const norwayRadio = page.getByLabel(/Norway NATO/i);
    if (await norwayRadio.isVisible()) await norwayRadio.check();
    await beginBtn.click();
    await page.waitForSelector(".national-economy-bar", { timeout: 10000 });
  }

  await page.waitForTimeout(1000);

  console.log("Locating Black Ops button...");
  // Look for covert ops / intelligence button
  const covertBtn = page.locator("button:has-text('Black Ops')").first();
  await covertBtn.click();
  await page.waitForSelector(".recruitment-modal", { timeout: 8000 });
  await page.waitForTimeout(1000);

  console.log("Capturing Planner view with assigned unit and mode selector...");
  await page.screenshot({
    path: "artifacts/visual-audit/qa-covert-ops-planner.png",
  });

  console.log("Authorizing & Generating Tactical Mission...");
  const launchBtn = page.locator(
    ".recruitment-submit-btn:has-text('Generate Tactical Mission')",
  );
  if ((await launchBtn.count()) > 0) {
    await launchBtn.click();
    await page.waitForTimeout(1500);

    console.log("Capturing Generated Tactical Sortie Scenario view...");
    await page.screenshot({
      path: "artifacts/visual-audit/qa-covert-ops-tactical-sortie.png",
    });

    console.log("Debriefing with Clean Infiltration...");
    const cleanBtn = page.locator(".sortie-outcome-btn.clean");
    if ((await cleanBtn.count()) > 0) {
      await cleanBtn.click();
      await page.waitForTimeout(1500);
      console.log("Capturing post-debrief Clandestine Intelligence Log...");
      await page.screenshot({
        path: "artifacts/visual-audit/qa-covert-ops-debriefed.png",
      });
    }
  } else {
    console.log(
      "Launch button state:",
      await page.locator(".recruitment-submit-btn").textContent(),
    );
  }

  await browser.close();
  console.log("QA Completed successfully!");
}

run().catch((err) => {
  console.error("QA error:", err);
  process.exit(1);
});
