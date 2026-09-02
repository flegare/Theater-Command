import { chromium } from "@playwright/test";
import { join } from "path";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });

  page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));
  page.on("pageerror", (err) => console.error("BROWSER ERROR:", err));

  console.log("Navigating to http://127.0.0.1:3100...");
  await page.goto("http://127.0.0.1:3100");
  await page.waitForTimeout(1500);

  const changeCampBtn = page.locator('button:has-text("Change campaign")');
  if (await changeCampBtn.isVisible()) {
    console.log("Resetting campaign via Change campaign...");
    await changeCampBtn.click();
    await page.waitForTimeout(1500);
  }

  const beginBtn = page.locator('button:has-text("Begin campaign")');
  if (await beginBtn.isVisible()) {
    console.log("Submitting setup form with Begin campaign...");
    await beginBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log("Waiting for formation counter...");
  await page.waitForSelector(".formation-map-counter", { timeout: 15000 });
  const counters = page.locator(".formation-map-counter");
  const count = await counters.count();
  console.log(`Found ${count} counters`);

  const artifactDir =
    "C:\\Users\\flega\\.gemini\\antigravity\\brain\\4971547e-40e7-45bd-9558-c7a6227b280b";

  // 1. Find and screenshot Allied NATO Carrier Strike Group (US Navy) and Norwegian Sovereign formation
  console.log("Searching for Allied and Sovereign formations...");
  let foundAllied = false;
  let foundSovereign = false;

  for (let i = 0; i < count; i++) {
    const closeBtn = page.locator(".leaflet-popup-close-button");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }

    console.log(`Clicking counter ${i}...`);
    await counters.nth(i).click({ force: true });
    await page.waitForTimeout(800);

    const isAllied = await page.locator(".allied-command-callout").isVisible();
    const isSovereign = await page
      .locator(".formation-tag.sovereign")
      .isVisible();
    console.log(
      `Counter ${i}: isAllied=${isAllied}, isSovereign=${isSovereign}`,
    );

    if (isAllied && !foundAllied) {
      console.log(`Found Allied NATO Formation popup on counter ${i}!`);
      foundAllied = true;
      await page.screenshot({
        path: join(artifactDir, "allied-nato-carrier-restricted.png"),
      });
      console.log("Saved allied-nato-carrier-restricted.png");
    }

    if (isSovereign && !foundSovereign) {
      console.log(`Found Sovereign Norwegian Formation popup on counter ${i}!`);
      foundSovereign = true;
      await page.screenshot({
        path: join(artifactDir, "port-operations-readiness.png"),
      });
      console.log("Saved port-operations-readiness.png");

      // Check if Embark on Sealift is available on this counter
      const embarkBtn = page
        .locator('button:has-text("Embark on Sealift")')
        .first();
      if (await embarkBtn.isVisible()) {
        console.log("Clicking Embark on Sealift...");
        await embarkBtn.click();
        await page.waitForTimeout(1200);

        // Re-click counter to capture 1-turn embarking status
        await counters.nth(i).click({ force: true });
        await page.waitForTimeout(800);
        await page.screenshot({
          path: join(artifactDir, "embarking-loading-state.png"),
        });
        console.log("Saved embarking-loading-state.png");
      }
    }

    if (foundAllied && foundSovereign) break;
  }

  // Close popup
  const closeBtnFinal = page.locator(".leaflet-popup-close-button");
  if (await closeBtnFinal.isVisible()) {
    await closeBtnFinal.click();
    await page.waitForTimeout(400);
  }

  // 2. Click-to-Move Multi-turn order and advance to destination to show Dismiss button
  const norwayCounters = page.locator(".formation-map-counter:not(.allied)");
  if ((await norwayCounters.count()) > 0) {
    await norwayCounters.first().click();
    await page.waitForTimeout(800);

    const movePathBtn = page
      .locator('button:has-text("Click-to-Move Path")')
      .first();
    if (await movePathBtn.isVisible()) {
      console.log("Starting click-to-move path planning...");
      await movePathBtn.click();
      await page.waitForTimeout(800);

      const mapEl = page.locator(".command-map");
      const box = await mapEl.boundingBox();
      if (box) {
        console.log("Clicking map destination...");
        await page.mouse.click(
          box.x + box.width * 0.48,
          box.y + box.height * 0.65,
        );
        await page.waitForTimeout(1000);
      }

      const confirmBtn = page.locator("button.movement-confirm-btn");
      if (await confirmBtn.isVisible()) {
        console.log("Confirming movement order...");
        await confirmBtn.click();
        await page.waitForTimeout(1200);

        // Advance 2 turns to arrive at destination
        const advanceBtn = page.locator("button.advance-turn-button");
        if (await advanceBtn.isVisible()) {
          console.log("Advancing Turn 1...");
          await advanceBtn.click();
          await page.waitForTimeout(1500);

          console.log("Advancing Turn 2...");
          await advanceBtn.click();
          await page.waitForTimeout(1500);

          // Click counter again to show Dismiss Route Notice
          await norwayCounters.first().click();
          await page.waitForTimeout(800);

          await page.screenshot({
            path: join(artifactDir, "route-dismissal-notice.png"),
          });
          console.log("Saved route-dismissal-notice.png");
        }
      }
    }
  }

  await browser.close();
  console.log("All UI verification screenshots captured successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
