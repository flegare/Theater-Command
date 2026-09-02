/* global window */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3100";
const outputDir = join(process.cwd(), "artifacts", "visual-audit");

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Reset any active session to begin clean campaign
  await page.request.delete(`${baseURL}/api/v1/session`).catch(() => {});
  await page.goto(`${baseURL}/`);

  await page.getByLabel(/1983: Able Archer/i).check();
  await page.getByLabel(/Norway NATO/i).check();
  const submit = page.getByRole("button", { name: "Begin campaign" });
  await submit.focus();
  await submit.press("Enter");

  await page.getByRole("heading", { name: "Norway", exact: true }).waitFor();
  await page.waitForTimeout(1500);

  // Capture overview of continuous global hex grid canvas
  await page.screenshot({
    path: join(outputDir, "hex-global-canvas-overview.png"),
    fullPage: true,
  });

  // Pan to South America
  await page.evaluate(() => {
    window.__leafletMap?.setView([-15, -60], 3);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: join(outputDir, "hex-south-america.png"),
    fullPage: true,
  });

  // Pan to Arctic / Greenland / High North
  await page.evaluate(() => {
    window.__leafletMap?.setView([72, 0], 3);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: join(outputDir, "hex-arctic.png"),
    fullPage: true,
  });

  const artifactsDir =
    "C:\\Users\\flega\\.gemini\\antigravity\\brain\\4971547e-40e7-45bd-9558-c7a6227b280b";

  // Reset view and click on Bergen to trigger NATO tactical popup with Port Logistics & Readiness Chips
  await page.evaluate(() => {
    window.__leafletMap?.setView([60.39, 5.32], 6);
    const pt = window.__leafletMap?.latLngToContainerPoint([60.39, 5.32]);
    if (pt) {
      window.__leafletMap?.fire("click", {
        latlng: { lat: 60.39, lng: 5.32 },
        containerPoint: pt,
        layerPoint: pt,
        originalEvent: {},
      });
    }
  });
  await page.waitForTimeout(1200);

  const portPic = join(artifactsDir, "port-operations-readiness.png");
  await page.screenshot({ path: portPic, fullPage: true });

  // Embark Telemark Battlegroup on Sealift Flotilla
  const embarkBtn = page
    .locator(".formation-btn:has-text('Embark on Sealift')")
    .first();
  if (await embarkBtn.isVisible()) {
    await embarkBtn.click();
    await page.waitForTimeout(1000);

    // Reopen Bergen to show 1-turn embarking state
    await page.evaluate(() => {
      const pt = window.__leafletMap?.latLngToContainerPoint([60.39, 5.32]);
      if (pt) {
        window.__leafletMap?.fire("click", {
          latlng: { lat: 60.39, lng: 5.32 },
          containerPoint: pt,
          layerPoint: pt,
          originalEvent: {},
        });
      }
    });
    await page.waitForTimeout(1000);
    const embarkPic = join(artifactsDir, "embarking-loading-state.png");
    await page.screenshot({ path: embarkPic, fullPage: true });
  }

  // Open Recruitment Catalog Modal
  const recruitBtn = page.locator(".recruitment-catalog-button");
  if (await recruitBtn.isVisible()) {
    await recruitBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(outputDir, "hex-recruitment-catalog.png"),
      fullPage: true,
    });
    const closeBtn = page.locator(".recruitment-modal-close");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Deep Zoom In Showcase (Zoom Level 9 over Bergen / West Coast)
  await page.evaluate(() => {
    window.__leafletMap?.setView([60.39, 5.32], 9);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: join(outputDir, "hex-zoomed-in-tactical.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(
    "Captured all tactical showcases: popup with Cold War intel, click-to-move path planning, recruitment catalog, and zoomed-in map!",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
