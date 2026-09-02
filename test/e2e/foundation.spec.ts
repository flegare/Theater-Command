import { expect, test } from "@playwright/test";

test("creates a Norway campaign from the setup screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(page).toHaveTitle(/Sea Power Theater Command/i);
  await expect(
    page.getByRole("heading", { name: /Assume national command/i }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  await page.getByLabel(/1983: Able Archer/i).check();
  await page.getByLabel(/Norway NATO/i).check();
  const submit = page.getByRole("button", { name: "Begin campaign" });
  await submit.focus();
  await submit.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Norway", exact: true }),
  ).toBeVisible();

  // Verify Civilization-style multi-resource national economy bar
  const economyBar = page.getByLabel("National Strategic Economy");
  await expect(economyBar).toBeVisible();
  await expect(economyBar.getByText(/National Treasury/i)).toBeVisible();
  await expect(economyBar.getByText(/Industrial Capacity/i)).toBeVisible();
  await expect(economyBar.getByText(/Strategic Fuel/i)).toBeVisible();
  await expect(
    economyBar.getByRole("button", { name: /Advance Strategic Turn/i }),
  ).toBeVisible();

  await expect(page.getByLabel("Strategic map", { exact: true })).toBeVisible();
  await expect(
    page.locator(".map-legend span").filter({ hasText: "Naval base" }),
  ).toBeVisible();
  await expect(
    page.locator(".map-legend span").filter({ hasText: "Air base" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("strategic-map")
      .locator(".strategic-marker.naval_base")
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("strategic-map")
      .locator(".strategic-marker.air_base")
      .first(),
  ).toBeVisible();
  await page
    .getByTestId("strategic-map")
    .locator(".strategic-marker.naval_base")
    .first()
    .click({ force: true });
  await expect(page.locator(".leaflet-popup-content")).toBeVisible();

  // Close marker popup and ensure it is gone
  await page.locator(".leaflet-popup-close-button").click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);

  // Click on a sector polygon (e.g. first sector path)
  const sectorPolygon = page.locator(".sector-polygon-layer").first();
  await sectorPolygon.dispatchEvent("click");

  // Verify popup opened and contains sector intelligence
  const sectorPopup = page.locator(".leaflet-popup-content .sector-popup");
  await expect(sectorPopup).toBeVisible();
  await expect(sectorPopup).toContainText("NATO (BLUFOR)");

  const isMobile = test.info().project.name.includes("mobile");
  await page.screenshot({
    path: `artifacts/visual-audit/${isMobile ? "mobile" : "desktop"}-norway-sector-popup.png`,
    fullPage: true,
  });

  // Click Generate Sea Power Mission from inside the popup
  const genMissionBtn = sectorPopup.getByRole("button", {
    name: "Generate Sea Power Mission",
  });
  await genMissionBtn.dispatchEvent("click");
  await expect(page.locator(".action-feedback.success")).toContainText(
    "Mission generated successfully",
  );
  await expect(page.locator(".generated-mission")).toBeVisible();
  const firstTitle = await page.locator(".generated-mission h4").innerText();
  expect(firstTitle.length).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Sea Power mission (.ini)" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ini$/i);

  await page
    .getByRole("button", { name: "Install mission to Sea Power" })
    .click();
  await expect(
    page.getByText(
      /Installed as .*\.ini in the Sea Power user missions folder/i,
    ),
  ).toBeVisible();

  // Click Set Lane Posture: Secure
  const secureBtn = sectorPopup.getByRole("button", {
    name: "Set Lane Posture: Secure",
  });
  await secureBtn.dispatchEvent("click");
  await expect(
    page.getByText("Lane posture set to secure successfully."),
  ).toBeVisible();
  const map = page.getByTestId("strategic-map");
  const mapPane = map.locator(".leaflet-map-pane");
  await expect(map).toBeVisible();
  await page.locator(".leaflet-control-zoom-in").click();
  const zoomedStyle = await mapPane.getAttribute("style");
  await page.waitForTimeout(750);
  await expect(mapPane).toHaveAttribute("style", zoomedStyle ?? "");

  // Test turn advancement with response synchronization
  const advancePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/state/advance-day") && resp.status() === 200,
  );
  await economyBar
    .getByRole("button", { name: /Advance Strategic Turn/i })
    .click();
  await advancePromise;
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
  await page.getByRole("button", { name: "Change campaign" }).click();
  await page.getByRole("button", { name: "Return to setup" }).click();
  await expect(
    page.getByRole("heading", { name: /Assume national command/i }),
  ).toBeVisible();
  await page.getByLabel("Theater").selectOption("north-pacific");
  await page.getByLabel(/United States ALLIED/i).check();
  await page
    .getByRole("button", { name: "Begin campaign" })
    .click({ force: true });
  await expect(page.getByText("North Pacific Theater")).toBeVisible();
  await expect(page.locator(".sector-polygon-layer")).toHaveCount(1);
  await expect(page.getByText(/Bergen–Scapa fuel lane/)).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/visual-audit/${isMobile ? "mobile" : "desktop"}-north-pacific-map.png`,
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
