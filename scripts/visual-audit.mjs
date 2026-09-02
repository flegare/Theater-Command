import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, devices } from "@playwright/test";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3100";
const ollamaURL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const model = process.env.OLLAMA_VISION_MODEL ?? "gemma3:4b";
const skipVision = process.env.AUDIT_SKIP_VISION === "1";
const outputDir = join(process.cwd(), "artifacts", "visual-audit");
const reviewOnly = process.env.AUDIT_REVIEW_ONLY === "1";
const reviewLimit = Number(process.env.AUDIT_REVIEW_LIMIT ?? "0");
const theaters = [
  { id: "northern-flank", country: "Norway", variant: /1983/ },
  { id: "north-pacific", country: "Japan", variant: /1983/ },
  { id: "persian-gulf", country: "Iran", variant: /1983/ },
  { id: "indian-ocean", country: "India", variant: /1983/ },
];

const rubric = `You are a strict visual QA reviewer for a strategic Cold War campaign UI.
Review the supplied screenshot only. Return JSON with this shape:
{"score":0-10,"issues":[{"severity":"critical|major|minor","area":"layout|readability|accessibility|domain|responsive|visual","finding":"...","fix":"..."}],"pass":true|false}
Check: clipped or overlapping content, empty command brief, controls that look disabled or misleading, unreadable text, broken map framing, incorrect theater/country labeling, mobile usability, and whether the screen communicates a credible strategic command workflow. Do not invent issues outside the screenshot.`;

async function getVisionReview(imageBase64, pageName) {
  const response = await fetch(`${ollamaURL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      prompt: `${rubric}\nPage: ${pageName}`,
      images: [imageBase64],
      options: { temperature: 0.1 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const payload = await response.json();
  try {
    return JSON.parse(payload.response);
  } catch {
    return {
      score: null,
      pass: false,
      issues: [
        {
          severity: "major",
          area: "tooling",
          finding: "Vision model did not return JSON.",
          fix: payload.response,
        },
      ],
    };
  }
}

async function capture(page, name) {
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  const image = (await import("node:fs/promises")).readFile(path);
  return { path, image: (await image).toString("base64") };
}

await mkdir(outputDir, { recursive: true });
if (reviewOnly) {
  const { readFile, readdir } = await import("node:fs/promises");
  const reportPath = join(outputDir, "report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const allFiles = (await readdir(outputDir)).filter((file) =>
    file.endsWith(".png"),
  );
  const files = reviewLimit > 0 ? allFiles.slice(0, reviewLimit) : allFiles;
  for (const file of files) {
    const image = (await readFile(join(outputDir, file))).toString("base64");
    try {
      report.reviews.push({
        page: file,
        review: await getVisionReview(image, file),
      });
    } catch (error) {
      report.reviews.push({
        page: file,
        review: {
          skipped: true,
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        outputDir,
        model,
        captures: report.captures.length,
        reviews: report.reviews.length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const browser = await chromium.launch();
const report = {
  generatedAt: new Date().toISOString(),
  baseURL,
  model,
  captures: [],
  reviews: [],
  functionalChecks: [],
};

try {
  for (const device of ["desktop", "mobile"]) {
    for (const theater of theaters) {
      const context = await browser.newContext(
        device === "mobile" ? devices["Pixel 5"] : devices["Desktop Chrome"],
      );
      const page = await context.newPage();
      await page.request.delete(`${baseURL}/api/v1/session`).catch(() => {});
      await page.goto(`${baseURL}/?audit=${theater.id}`);
      await page
        .getByRole("heading", { name: /Assume national command/i })
        .waitFor();
      await page.getByLabel("Theater").selectOption(theater.id);
      await page.waitForTimeout(400);
      await page
        .getByRole("radio", { name: theater.variant })
        .click({ force: true });
      await page
        .locator("label.country-choice")
        .filter({ hasText: theater.country })
        .click({ force: true });
      await page.waitForTimeout(200);
      try {
        await page.getByText(theater.country, { exact: true }).last().waitFor();
      } catch (error) {
        throw new Error(
          `${theater.id} setup brief missing. BODY=${(await page.locator("body").innerText()).slice(0, 1000)}; ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await page.getByRole("heading", { name: theater.country }).isVisible();
      const setup = await capture(page, `${device}-${theater.id}-setup`);
      report.captures.push({
        page: `${device}/${theater.id}/setup`,
        path: setup.path,
      });
      report.functionalChecks.push({
        theater: theater.id,
        device,
        setupBriefVisible: await page
          .getByRole("heading", { name: theater.country })
          .isVisible(),
      });
      const submit = page.getByRole("button", { name: /Begin campaign/i });
      const creation = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/campaigns") &&
          response.request().method() === "POST",
      );
      await submit.focus();
      await submit.press("Enter");
      const creationResponse = await creation;
      if (!creationResponse.ok()) {
        throw new Error(
          `${theater.id} campaign creation failed: ${creationResponse.status()} ${await creationResponse.text()}`,
        );
      }
      await page.getByText("THEATER COMMAND / ACTIVE CAMPAIGN").waitFor();
      const commandCountry = page
        .getByText(theater.country, { exact: true })
        .last();
      try {
        await commandCountry.waitFor();
      } catch (error) {
        throw new Error(
          `${theater.id} command view missing country. URL=${page.url()} BODY=${(await page.locator("body").innerText()).slice(0, 1200)}; ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const command = await capture(page, `${device}-${theater.id}-command`);
      report.captures.push({
        page: `${device}/${theater.id}/command`,
        path: command.path,
      });
      report.functionalChecks.push({
        theater: theater.id,
        device,
        commandMapVisible:
          (await page
            .getByLabel("Northern Flank strategic map")
            .isVisible()
            .catch(() => false)) ||
          (await page
            .getByLabel(/strategic map/i)
            .isVisible()
            .catch(() => false)),
      });
      for (const image of skipVision ? [] : [setup, command]) {
        try {
          report.reviews.push({
            page: image.path,
            review: await getVisionReview(image.image, image.path),
          });
        } catch (error) {
          report.reviews.push({
            page: image.path,
            review: {
              skipped: true,
              reason: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
      await page.request.delete(`${baseURL}/api/v1/session`);
      await context.clearCookies();
      await page.goto(`${baseURL}/`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  join(outputDir, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      outputDir,
      model,
      captures: report.captures.length,
      reviews: report.reviews.length,
      functionalChecks: report.functionalChecks.length,
    },
    null,
    2,
  ),
);
