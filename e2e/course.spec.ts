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
  const lessonCount = await page.locator("[data-lesson-id]").count();
  await expect(page.locator("#progress-lessons")).toHaveText(`1 of ${lessonCount}`);
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

test("one neuron separates clusters, fails opposite corners, and the cut-off trades errors", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/neuron-lab.html");
  const stats = page.locator("#neuron-stats");
  await expect(page.locator("#neuron-simulation-status")).toContainText("Current");
  const falseAlarms = async () =>
    Number(await stats.locator(".stat", { hasText: "False alarms" }).locator("strong").innerText());
  const misses = async () =>
    Number(await stats.locator(".stat", { hasText: "Misses" }).locator("strong").innerText());
  const before = { alarms: await falseAlarms(), misses: await misses() };
  await page.locator("#neuron-threshold").fill("0.85");
  expect(await falseAlarms()).toBeLessThanOrEqual(before.alarms);
  expect(await misses()).toBeGreaterThan(before.misses);

  const card = page.locator("#predict");
  await card.locator(".predict-step", { hasText: "Next prediction" }).click();
  await card.locator('.predict-choices button[data-choice="chance"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(page.locator("#neuron-outcome")).toContainText("coin flip");
  expect(errors).toEqual([]);
});

test("the lesson network needs three hidden neurons to enclose the ring", async ({ page }) => {
  await page.goto("/lesson-04-networks.html");
  await page.locator("#net-pattern").selectOption("circle");
  await expect(page.locator("#stat-4")).toHaveText("Too simple");
  await page.locator("#net-units").fill("3");
  await expect(page.locator("#stat-4")).toHaveText("Captured");
  await expect(page.locator("#stat-2")).toHaveText("13");
});

test("the playground learns the ring live, then shows blame for a chosen example", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/network-playground.html");
  await expect(page.locator("#play-outcome")).toContainText("Step 0.");
  await page.locator("#play-speed").selectOption("500");
  await page.locator("#play-play").click();
  await expect(page.locator("#play-play")).toHaveText("Pause");
  await expect(page.locator("#play-outcome")).toContainText("It has the pattern", {
    timeout: 25_000,
  });
  await page.locator("#play-play").click();
  await expect(page.locator("#play-play")).toHaveText("Play");

  await page.locator("#play-mode").click();
  await expect(page.locator("#play-diagram-caption")).toContainText("Blame");
  await expect(page.locator("#play-map-chart .plot-point.picked")).toHaveCount(1);
  await expect(page.locator("#play-ledger tr")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("letters fuse into tokens, and unfamiliar words stay in fragments", async ({ page }) => {
  await page.goto("/lesson-05-text.html");
  const chips = page.locator("#bpe-chips li");
  const characters = await chips.count();
  await page.locator("#bpe-merges").fill("400");
  expect(await chips.count()).toBeLessThan(characters / 3);
  await expect(chips.first()).toHaveText("alice");
  await page.locator("#bpe-sentence").selectOption({ index: 1 });
  await expect(page.locator("#bpe-prose")).toContainText("never met these words");
  await expect(page.locator("#embedding-caption")).toContainText("nearest word is “queen”");
});

test("analogies need room: eight dimensions solve them, two do not", async ({ page }) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/embedding-lab.html");
  const stats = page.locator("#embed-stats");
  await expect(stats).toContainText("6 of 6");
  await page.locator("#embed-text").fill("the jabberwocky");
  await expect(page.locator("#embed-token-outcome")).toContainText("“jabberwocky” costs");

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="few"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(stats).toContainText("2 of 6");
  await expect(page.locator("#embed-ledger tr")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("attention follows the question, from the keyboard, and flips with the last word", async ({
  page,
}) => {
  await page.goto("/attention-lab.html");
  const stats = page.locator("#attn-stats");
  await expect(page.locator("#attn-name")).toContainText("animal");
  await page.locator("#attn-ending").selectOption("wide");
  await expect(page.locator("#attn-name")).toContainText("street");
  await expect(stats).toContainText("a place");

  const before = await page.locator("#attn-queryX").inputValue();
  await page.locator("#attn-plane [data-handle='0']").focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect(await page.locator("#attn-queryX").inputValue()).not.toBe(before);

  await page.locator("#attn-direction").selectOption("backwards");
  await expect(page.locator("#attn-outcome")).toContainText("3 later words are hidden");
  await expect(page.locator("#attn-arcs .hidden-word")).toHaveCount(3);
});

test("a longer context turns composing into reciting, and greedy picking into a loop", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-07-next-token.html");
  await expect(page.locator("#stat-4")).toHaveText("Noise");
  await page.locator("#lm-context").fill("5");
  await expect(page.locator("#stat-4")).toHaveText("Composing");
  await page.locator("#lm-context").fill("12");
  await expect(page.locator("#stat-4")).toHaveText("Reciting");
  await expect(page.locator("#lm-output mark").first()).toBeVisible();

  await page.goto("/next-token-lab.html");
  await expect(page.locator("#lm-simulation-status")).toContainText("Current", {
    timeout: 20_000,
  });
  await expect(page.locator("#lm-ledger tr")).toHaveCount(10);
  await page.locator("#lm-step").click();
  await page.locator("#lm-step").click();
  await expect(page.locator("#lm-outcome")).toContainText("Last step it picked");

  const card = page.locator("#predict");
  await card.locator(".predict-step", { hasText: "Next prediction" }).click();
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 25_000 });
  await expect(page.locator("#lm-description")).toContainText("Stuck in a loop");
  expect(errors).toEqual([]);
});

test("the ladder climbs from two knobs to hundreds of billions, and cost grows with the square", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-08-scale.html");
  await expect(page.locator("#stat-1")).toHaveText("2");
  await page.locator("#scale-rung").fill("11");
  await expect(page.locator("#stat-1")).toHaveText("405 billion");
  await expect(page.locator("#stat-3")).toHaveText("15 trillion tokens");
  await expect(page.locator("#scale-prose")).toContainText("thousand years");

  await page.goto("/scale-ladder.html");
  await expect(page.locator("#ladder-simulation-status")).toContainText("Current");
  await expect(page.locator("#ladder-ledger tr")).toHaveCount(12);
  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="hundred"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(page.locator("#ladder-name")).toHaveText("10 billion knobs");
  expect(errors).toEqual([]);
});

test("the capstone starts unready, exposes the leak, and can be earned", async ({ page }) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/capstone.html");
  await expect(page.locator("#cap-simulation-status")).toContainText("Current");
  await expect(page.locator("#cap-status")).toHaveText("Not ready");
  await expect(page.locator("#cap-stats")).toContainText("0 of 7");
  await expect(page.locator("#cap-outcome")).toContainText("The archive contained the answer");

  await page.locator("#cap-leak").selectOption("out");
  await expect(page.locator('#cap-checks tr[data-check="leak"] td').nth(1)).toHaveText("Passed");
  await page.locator("#cap-split").selectOption("three-way");
  await page.locator("#cap-capacity").selectOption("lean");
  await page.locator("#cap-metric").selectOption("cancellers");
  await page.locator("#cap-threshold").fill("0.3");
  await expect(page.locator("#cap-status")).toHaveText("Ready to ship", { timeout: 15_000 });
  await expect(page.locator("#cap-stats")).toContainText("7 of 7");
  await expect(page.locator("#cap-card")).toContainText("Checks passed: 7 of 7");
  expect(errors).toEqual([]);
});

test("the guide decodes a number and shows what peeking at the test set costs", async ({
  page,
}) => {
  await page.goto("/names-guide.html");
  await expect(page.locator("#guide-item-kind")).toHaveText("parameter");
  await page.locator("#guide-items button", { hasText: "The learning rate" }).click();
  await expect(page.locator("#guide-item-kind")).toHaveText("hyperparameter");
  await expect(page.locator("#guide-use-inflation")).toHaveText("none");
  await page.locator("#guide-uses button", { hasText: "Scored 20 models" }).click();
  await expect(page.locator("#guide-use-inflation")).toContainText("points");
  await expect(page.locator("#guide-use-note")).toContainText("Nothing got better");
});

test("every page type offers a skip link to its main content", async ({ page }) => {
  for (const path of [
    "/",
    "/lesson-03-decisions.html",
    "/attention-lab.html",
    "/names-guide.html",
  ]) {
    await page.goto(path);
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveText("Skip to content");
    await expect(page.locator("main#content")).toHaveCount(1);
  }
});
