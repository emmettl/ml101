import { readdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * An automated WCAG 2.1 A/AA scan of every page, in both themes. It catches what a machine
 * can: missing names, bad roles, contrast, focusable content hidden from assistive technology.
 * It is a floor, not a substitute for listening to the pages with a screen reader.
 */
const pages = readdirSync(process.cwd())
  .filter((name) => name.endsWith(".html"))
  .sort();

for (const theme of ["light", "dark"] as const) {
  for (const name of pages) {
    test(`${name} has no detectable accessibility violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`/${name}`);
      await page.waitForLoadState("networkidle");
      const statuses = page.locator('[id$="simulation-status"]');
      for (let index = 0; index < (await statuses.count()); index += 1)
        await expect(statuses.nth(index)).toContainText(/current/i, { timeout: 20_000 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();
      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} node(s), e.g. ${violation.nodes[0]?.target.join(" ")}`,
      );
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}

test.describe("what a screen reader is told", () => {
  test("sliders have stable names and speak their value in real units", async ({ page }) => {
    await page.goto("/descent-lab.html");
    const lab = page.getByRole("slider", { name: "Learning rate (stride)", exact: true });
    await expect(lab).toHaveAttribute("aria-valuetext", "0.050");
    await lab.fill("-1");
    await expect(lab).toHaveAttribute("aria-valuetext", "0.100");
    await expect(page.locator("#descent-controls output").first()).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await page.goto("/lesson-01-descent.html");
    const lesson = page.getByRole("slider", { name: "Learning rate", exact: true });
    // The raw slider position is −1.7; a listener should hear the learning rate itself.
    await expect(lesson).toHaveAttribute("aria-valuetext", "0.020");
    await lesson.fill("-1");
    await expect(lesson).toHaveAttribute("aria-valuetext", "0.100");
  });

  test("a chart full of draggable points is one tab stop, stepped through with Page Down", async ({
    page,
  }) => {
    await page.goto("/line-fitter.html");
    const chart = page.locator("#fit-data-chart");
    await expect(chart).toHaveAttribute("role", "group");
    await expect(chart.locator('[data-handle][tabindex="0"]')).toHaveCount(1);
    await expect(chart.locator("g[data-plot-layer]")).toHaveAttribute("aria-hidden", "true");

    await chart.locator('[data-handle="0"]').focus();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Example 1, 1 of 24, at /);
    await page.keyboard.press("PageDown");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Example 2, 2 of 24, at /);
    const before = await page.locator(":focus").getAttribute("aria-label");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(":focus")).not.toHaveAttribute("aria-label", before ?? "");
    await page.keyboard.press("PageUp");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Example 1, /);
    await expect(chart.locator('[data-handle][tabindex="0"]')).toHaveCount(1);
  });

  test("readouts are announced once they settle, not on every movement", async ({ page }) => {
    await page.goto("/lesson-00-knobs.html");
    const prose = page.locator("#knob-prose");
    await expect(prose).not.toHaveAttribute("aria-live", /.*/);
    const spoken = page.locator("#knob-prose + [role='status']");
    await expect(spoken).toHaveAttribute("aria-live", "polite");
    await expect(spoken).toHaveText("");

    const slope = page.locator("#knob-slope");
    for (const value of ["0.5", "0.9", "1.36"]) await slope.fill(value);
    await page.locator("#knob-intercept").fill("0.19");
    await expect(spoken).toHaveText("", { timeout: 300 });
    await expect(spoken).toContainText("as good as a straight line gets", { timeout: 4000 });
  });

  test("right and wrong are said in words, not only shown in colour", async ({ page }) => {
    await page.goto("/lesson-00-knobs.html");
    const quiz = page.locator(".quiz").first();
    await quiz.locator(".quiz-options button").first().click();
    await expect(quiz.locator(".quiz-feedback")).toContainText("Not quite.");
    await quiz.locator('.quiz-options button[data-correct="true"]').click();
    await expect(quiz.locator(".quiz-feedback")).toContainText("Correct.");

    await page.goto("/overfitting-lab.html");
    await expect(page.locator("#overfit-simulation-status")).toContainText("Current");
    const card = page.locator("#predict");
    await card.locator('.predict-choices button[data-choice="small"]').click();
    await card.locator(".predict-reveal").click();
    await expect(card.locator(".predict-feedback")).toContainText("Not this time.", {
      timeout: 15_000,
    });
    await expect(card.locator('button[data-choice="big"]')).toContainText("(what happened)");
    await expect(card.locator('button[data-choice="small"]')).toContainText("(your prediction)");
  });

  test("tables are named, and the mouse-only example picker has a keyboard route", async ({
    page,
  }) => {
    await page.goto("/network-playground.html");
    const table = page.locator("table.ledger");
    await expect(table).toHaveAttribute("aria-labelledby", "ledger-title");
    await expect(table.locator("thead th").first()).toHaveAttribute("scope", "col");
    await page.getByRole("button", { name: "Select another example" }).click();
    await expect(page.locator("#play-map-chart .plot-point.picked")).toHaveCount(1);
    await expect(page.locator("#play-outcome")).toContainText("Selected example:");
  });

  test("each page has one main landmark holding its heading, and distinct sidebars", async ({
    page,
  }) => {
    for (const path of ["/descent-lab.html", "/names-guide.html", "/lesson-02-overfitting.html"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
    }
    await expect(page.getByRole("complementary", { name: "About this lesson" })).toHaveCount(1);
    await expect(page.getByRole("complementary", { name: "Lesson contents" })).toHaveCount(1);
  });
});
