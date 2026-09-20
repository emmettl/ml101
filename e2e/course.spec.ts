import { expect, test, type Page } from "@playwright/test";

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("a lesson completes when both checks are right, and the home page resumes from there", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-00-knobs.html");
  const quizzes = page.locator(".quiz");
  await expect(quizzes).toHaveCount(2);

  await quizzes.nth(0).locator(".quiz-options button").first().click();
  await expect(quizzes.nth(0).locator(".quiz-feedback")).toContainText("recipe never changed");
  await expect(page.locator(".lesson-completion")).toContainText("0 of 2");

  for (const index of [0, 1]) {
    await quizzes.nth(index).locator('.quiz-options button[data-correct="true"]').click();
  }
  await expect(page.locator(".lesson-completion")).toContainText("Lesson complete");
  await expect(page.locator('.lesson-progress a[aria-current="page"]')).toHaveClass(/is-complete/);

  await page.goto("/");
  await expect(page.locator("#learner-progress")).toBeVisible();
  await expect(page.locator("#progress-lessons")).toHaveText("1 of 3");
  await expect(page.locator("#progress-quizzes")).toHaveText("2");
  await expect(page.locator("#resume-link")).toHaveText("Continue with Rolling downhill");
  await expect(page.locator('[data-lesson-id="knobs"] .lesson-status')).toHaveText("Completed");
  expect(errors).toEqual([]);
});

test("the lesson widget reads the fit back in words", async ({ page }) => {
  await page.goto("/lesson-00-knobs.html");
  await expect(page.locator("#knob-prose")).toContainText("A long way off");
  await page.locator("#knob-slope").fill("1.36");
  await page.locator("#knob-intercept").fill("0.19");
  await expect(page.locator("#stat-3")).toHaveText("0.88");
  await expect(page.locator("#knob-prose")).toContainText("as good as a straight line gets");
});

test("a prediction is graded against the lab's own numbers, restored and remembered", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/overfitting-lab.html");
  await expect(page.locator("#overfit-simulation-status")).toContainText("Current");
  const card = page.locator("#predict");
  await expect(card.locator(".predict-question")).toContainText("flexibility to 12");

  await card.locator('.predict-choices button[data-choice="big"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(card.locator(".predict-feedback")).toContainText("Held-out miss went from");
  await expect(page.locator("#overfit-degree")).toHaveValue("12");

  await card.locator(".predict-restore").click();
  await expect(page.locator("#overfit-degree")).toHaveValue("6");

  await page.reload();
  await expect(page.locator("#predict .predict-remembered")).toContainText("correctly");
  await page.goto("/");
  await expect(page.locator("#progress-predictions")).toHaveText("1");
  await expect(page.locator("#resume-link")).toHaveText("Continue Overfitting Lab");
  expect(errors).toEqual([]);
});

test("a trap prediction marks the intuitive answer wrong", async ({ page }) => {
  await page.goto("/overfitting-lab.html");
  const card = page.locator("#predict");
  await card.locator(".predict-step", { hasText: "Next prediction" }).click();
  await expect(card.locator(".predict-question")).toContainText("60 training examples");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Not this time.", {
    timeout: 15_000,
  });
  await expect(card.locator('.predict-choices button[data-choice="up"]')).toHaveClass(/correct/);
});

test("the theme toggle switches, persists and leaves charts intact", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/line-fitter.html");
  const html = page.locator("html");
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await paper();

  await page.locator("[data-theme-toggle]").click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await paper()).not.toBe(light);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#fit-map-chart .plot-point.here")).toHaveCount(1);
  await expect(page.locator("#fit-map-host canvas")).toBeVisible();
});

test("descent runs away above the largest safe rate and arrives below it", async ({ page }) => {
  await page.goto("/descent-lab.html");
  const stats = page.locator("#descent-stats");
  await expect(stats).toContainText("Arrives");

  await page.locator("#descent-learningRate").fill(String(Math.log10(0.3).toFixed(2)));
  await expect(stats).toContainText("Runs away");
  await expect(stats).toContainText("over 1,000,000");

  await page.locator("#descent-speed").selectOption("40");
  await page.locator("#descent-play").click();
  await expect(page.locator("#descent-outcome")).toContainText("Gone after", { timeout: 15_000 });
  await expect(page.locator("#descent-play")).toHaveText("Play");
});

test("the landscape dot can be moved from the keyboard and drives the knobs", async ({ page }) => {
  await page.goto("/line-fitter.html");
  const slope = page.locator("#fit-slope");
  await expect(slope).toHaveValue("0.2");
  await page.locator("#fit-map-chart [data-handle='0']").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(slope).toHaveValue("0.4");

  await page.locator("#fit-snap").click();
  await expect(page.locator("#fit-outcome")).toContainText("bottom of the valley");
});

test("the U-curve can be inspected from the keyboard and selects a flexibility", async ({
  page,
}) => {
  await page.goto("/overfitting-lab.html");
  await page.locator("#overfit-sweep-chart").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#overfit-degree")).toHaveValue("12");
  await expect(page.locator("#overfit-name")).toHaveText("Memorising");
});

test("the code peek is closed by default and shows the engine's real source", async ({ page }) => {
  await page.goto("/descent-lab.html");
  const peek = page.locator(".code-peek");
  await expect(peek).not.toHaveAttribute("open", "");
  await peek.locator("summary").click();
  await expect(peek.locator("pre").first()).toContainText("export function descentStep");
  await expect(peek.locator("pre").nth(1)).toContainText("import numpy as np");
});

test("the glossary filters as you type", async ({ page }) => {
  await page.goto("/glossary.html");
  await page.locator("#glossary-search").fill("learning rate");
  await expect(page.locator("#glossary-count")).toContainText("term");
  await expect(page.locator(".glossary-entry:visible").first()).toBeVisible();
  await expect(page.locator("#learning-rate")).toBeVisible();
  await expect(page.locator("#outlier")).toBeHidden();
});
