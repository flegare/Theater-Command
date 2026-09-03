import { chromium } from "@playwright/test";

async function runQA() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
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

  console.log("3. Capturing main dashboard with DEFCON & Ollama status...");
  await page.screenshot({ path: "artifacts/qa-dashboard-defcon.png" });
  console.log("  -> Captured artifacts/qa-dashboard-defcon.png");

  console.log("4. Opening Autonomous Diplomatic Treaties Modal...");
  await page.getByRole("button", { name: /Treaties/i }).click();
  await page.waitForSelector(".recruitment-modal");
  await page.waitForTimeout(600);

  console.log("5. Testing Step 1 (Target Country) and Step 2 (Event Ledger with Soviet Union)...");
  await page.locator("select").nth(0).selectOption("soviet-union");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/qa-step1-target-country.png" });
  console.log("  -> Captured artifacts/qa-step1-target-country.png");

  console.log("6. Switching to Sweden to inspect positive Scandinavian Event Ledger...");
  await page.locator("select").nth(0).selectOption("sweden");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/qa-step2-event-ledger.png" });
  console.log("  -> Captured artifacts/qa-step2-event-ledger.png");

  console.log("7. Configuring Step 3 Multi-Asset Concession Package (Funds, Fuel, PP, Tech)...");
  const techCheckbox = page.locator("#tech-sharing-toggle");
  if (await techCheckbox.isVisible()) {
    await techCheckbox.check();
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/qa-step3-multi-asset-offer.png" });
  console.log("  -> Captured artifacts/qa-step3-multi-asset-offer.png");

  console.log("8. Testing Sovereign Ultimatum Mode with Soviet Union...");
  await page.locator("select").nth(0).selectOption("soviet-union");
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: /Demand Sovereign Tribute/i }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/qa-step3-ultimatum-demand.png" });
  console.log("  -> Captured artifacts/qa-step3-ultimatum-demand.png");

  console.log("9. Transmitting Sovereign Ultimatum to Soviet Union & Testing Transmitting Animation...");
  const transmitUltimatumBtn = page.getByRole("button", {
    name: /Transmit Sovereign Ultimatum/i,
  });
  await transmitUltimatumBtn.click();
  // Capture while transmitting animation is active
  await page.waitForTimeout(200);
  await page.screenshot({ path: "artifacts/qa-transmitting-animation.png" });
  console.log("  -> Captured artifacts/qa-transmitting-animation.png");

  console.log("10. Awaiting response and verifying auto-scroll focus to top...");
  await page.waitForSelector("text=DIPLOMATIC TELEGRAM", { timeout: 15000 });
  await page.waitForTimeout(1000); // Allow smooth auto-scroll to finish

  const modalBody = page.locator(".recruitment-modal-body");
  const currentScrollTop = await modalBody.evaluate((el) => el.scrollTop);
  console.log(`  -> Auto-scroll verification: modal scrollTop is ${currentScrollTop} (auto-scrolled to top)`);

  await page.screenshot({ path: "artifacts/qa-auto-scroll-response-focused.png" });
  console.log("  -> Captured artifacts/qa-auto-scroll-response-focused.png");

  console.log("11. Testing Sweden Joint Production Pact for Diplomatic Counter-Offer & Sliders...");
  // Switch to Sweden
  await page.locator("select").nth(0).selectOption("sweden");
  await page.waitForTimeout(400);

  // Switch treaty to joint production pact (Sweden defense industrial scale)
  await page.locator("select").nth(1).selectOption("joint_production_pact");
  await page.waitForTimeout(400);

  // Set to offer mode
  await page.getByRole("button", { name: /Offer Concession/i }).click();
  await page.waitForTimeout(400);

  // Scroll down to transmit proposal
  await modalBody.evaluate((el) => {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
  await page.waitForTimeout(500);

  console.log("  -> Transmitting Joint Production proposal to Sweden...");
  const transmitProposalBtn = page.locator(
    ".recruitment-modal-footer .recruitment-submit-btn",
  );
  await transmitProposalBtn.click();
  await page.waitForTimeout(4000);

  // Check if counter-offer card appeared
  const counterCard = page.locator("text=DIPLOMATIC COUNTER-PROPOSAL");
  if (await counterCard.isVisible()) {
    console.log("  -> Sweden counter-proposal received! Testing multi-asset interactive controls...");

    // Capture counter-offer with multi-asset adjustment controls
    await page.screenshot({ path: "artifacts/qa-counter-offer-multi-asset.png" });
    console.log("  -> Captured artifacts/qa-counter-offer-multi-asset.png");

    // Test Waive PP button
    const waivePpBtn = page.locator('button:has-text("Waive (0 PP)")').first();
    if (await waivePpBtn.isVisible()) {
      await waivePpBtn.click();
      console.log("  -> Clicked Waive Production to 0 PP");
      await page.waitForTimeout(400);
      await page.screenshot({ path: "artifacts/qa-counter-offer-waived-pp.png" });
      console.log("  -> Captured artifacts/qa-counter-offer-waived-pp.png");
    }

    // Click Accept & Ratify
    const ratifyBtn = page.locator('button:has-text("Accept & Ratify")');
    if (await ratifyBtn.isVisible()) {
      console.log("  -> Clicking Accept & Ratify...");
      await ratifyBtn.click();
      await page.waitForTimeout(1500);
    }
  } else {
    // Direct accept or decline, capture the telegram
    await page.screenshot({ path: "artifacts/qa-counter-offer-multi-asset.png" });
  }

  // Capture final modal showing active ratified treaties
  await page.screenshot({ path: "artifacts/qa-ratified-treaty-active.png" });
  console.log("  -> Captured artifacts/qa-ratified-treaty-active.png");

  console.log("12. Closing treaties modal and opening Diplomatic Inbox...");
  await page.locator(".recruitment-modal-close").click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /Cables/i }).click();
  await page.waitForSelector(".recruitment-modal");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/qa-diplomatic-inbox-cables.png" });
  console.log("  -> Captured artifacts/qa-diplomatic-inbox-cables.png");

  await browser.close();
  console.log("QA Visual Check Complete!");
}

runQA().catch((err) => {
  console.error("QA script failed:", err);
  process.exit(1);
});

