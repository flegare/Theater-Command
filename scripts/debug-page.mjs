import { chromium } from "@playwright/test";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  await page.goto("http://127.0.0.1:3100");
  await page.waitForTimeout(1500);

  const beginBtn = page.locator('button:has-text("Begin campaign")');
  if (await beginBtn.isVisible()) {
    console.log("Submitting setup form with Begin campaign...");
    await beginBtn.click();
    await page.waitForTimeout(2500);
  }

  const formations = await page.evaluate(async () => {
    const res = await fetch("/api/v1/campaigns/current/hex-grid");
    const json = await res.json();
    return json.formations.map((f) => ({
      name: f.name,
      countryId: f.countryId,
      side: f.side,
      hexId: f.hexId,
    }));
  });
  console.log("Formations in campaign:", formations);

  // Click counter corresponding to Norway Surface Action Group (KNM Oslo)
  const counters = page.locator(".formation-map-counter");
  const count = await counters.count();
  console.log(`Found ${count} counters on map`);

  for (let i = 0; i < count; i++) {
    const closeBtn = page.locator(".leaflet-popup-close-button");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
    await counters.nth(i).click({ force: true });
    await page.waitForTimeout(600);

    const title = await page
      .locator(".sector-popup-header h4")
      .innerText()
      .catch(() => "");
    const badge = await page
      .locator(".formation-tag.sovereign")
      .first()
      .innerText()
      .catch(() => "");
    const isSovereign = await page
      .locator(".formation-tag.sovereign")
      .first()
      .isVisible()
      .catch(() => false);
    const isAllied = await page
      .locator(".formation-tag.allied")
      .first()
      .isVisible()
      .catch(() => false);
    console.log(
      `Counter ${i} popup: title="${title}", isSovereign=${isSovereign} (${badge}), isAllied=${isAllied}`,
    );

    if (isSovereign) {
      await page.screenshot({
        path: "C:\\Users\\flega\\.gemini\\antigravity\\brain\\4971547e-40e7-45bd-9558-c7a6227b280b\\sovereign-norway-formation-orders.png",
      });
      console.log("Saved sovereign-norway-formation-orders.png!");
      break;
    }
  }

  await browser.close();
}
run().catch(console.error);
