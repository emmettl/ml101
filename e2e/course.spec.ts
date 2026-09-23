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

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("lab settings dock to the bottom so the chart stays in view while a knob moves", async ({
    page,
  }) => {
    const errors = monitorRuntimeErrors(page);
    await page.goto("/descent-lab.html");
    const dock = page.locator(".controls.is-dock");
    await expect(dock).toBeVisible();
    await expect(page.locator(".control-block:visible")).toHaveCount(1);
    await expect(page.locator(".dock-position")).toHaveText("1 of 3");

    await page.locator("#descent-map-chart").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return { dock: box(".controls"), chart: box("#descent-map-chart"), height: innerHeight };
    });
    expect(Math.round(geometry.dock.bottom)).toBe(geometry.height);
    expect(geometry.dock.height).toBeLessThan(200);
    expect(geometry.chart.bottom).toBeLessThanOrEqual(geometry.dock.top + 1);

    await page.locator("#descent-learningRate").fill("-0.52");
    await expect(page.locator("#descent-stats")).toContainText("Runs away");

    await page.getByRole("button", { name: "Next setting" }).click();
    await expect(page.locator(".dock-position")).toHaveText("2 of 3");
    await expect(page.locator("#descent-batch")).toBeVisible();
    await expect(page.locator("#descent-learningRate")).toBeHidden();
    await expect(page.getByRole("button", { name: "Previous setting" })).toBeEnabled();

    await page.locator(".section-toggle").click();
    await expect(page.locator(".control-block:visible")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a prediction brings the control it moves to the front of the dock", async ({ page }) => {
    await page.goto("/overfitting-lab.html");
    await expect(page.locator("#overfit-simulation-status")).toContainText("Current");
    await page.getByRole("button", { name: "Next setting" }).click();
    await expect(page.locator("#overfit-degree")).toBeHidden();
    const card = page.locator("#predict");
    await card.locator('.predict-choices button[data-choice="big"]').click();
    await card.locator(".predict-reveal").click();
    await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
    await expect(page.locator("#overfit-degree")).toBeVisible();
    await expect(page.locator(".dock-position")).toHaveText("1 of 4");
  });

  test("every lab with settings docks them, without horizontal overflow", async ({ page }) => {
    for (const path of [
      "/line-fitter.html",
      "/neuron-lab.html",
      "/network-playground.html",
      "/embedding-lab.html",
      "/attention-lab.html",
      "/next-token-lab.html",
      "/scale-ladder.html",
      "/capstone.html",
    ]) {
      await page.goto(path);
      await expect(page.locator(".controls.is-dock"), path).toBeVisible();
      await expect(page.locator(".control-block:visible"), path).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test("on a desktop the settings stay a sidebar with every control showing", async ({ page }) => {
  await page.goto("/descent-lab.html");
  await expect(page.locator(".controls.is-dock")).toHaveCount(0);
  await expect(page.locator(".dock-pager")).toBeHidden();
  await expect(page.locator(".control-block:visible")).toHaveCount(3);
});

test("the network trains in a worker, cannot memorise, and is scored beside the table", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/table-vs-network.html");
  const status = page.locator("#duel-simulation-status");
  await expect(status).toContainText("not yet trained");
  await expect(page.locator("#duel-network-caption")).toContainText("untrained");

  await page.locator("#duel-budget").selectOption("200000");
  await page.locator("#duel-train").click();
  await expect(page.locator("#duel-train")).toHaveText("Stop");
  await expect(status).toContainText("trained on 200,000 characters", { timeout: 60_000 });

  const figure = async (label: string) =>
    Number(
      (
        await page.locator("#duel-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/,/g, ""),
    );
  expect(await figure("Network: gap")).toBeLessThan(await figure("Table: gap"));
  expect(await figure("Network: knobs")).toBeLessThan((await figure("Table: numbers stored")) / 5);
  await expect(page.locator("#duel-ledger tr").nth(1).locator("td").nth(5)).toHaveText("0%");
  await expect(page.locator("#duel-neighbours")).toContainText("sits nearest");

  expect(errors).toEqual([]);
});

test("an unseen context makes the table fall back while the network still reads it all", async ({
  page,
}) => {
  await page.goto("/table-vs-network.html");
  await page.locator("#duel-prompt").selectOption("alice looked at the jabberw");
  await expect(page.locator("#duel-table-caption")).toContainText("never seen these characters");
});

test("retrieval finds the book's wording, misses a reader's, and more passages reach a buried answer", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-09-open-book.html");
  await expect(page.locator("#stat-1")).toHaveText("350");
  await expect(page.locator("#stat-4")).toHaveText("Yes, ranked 1");
  await expect(page.locator("#ob-passages li.has-answer mark")).toContainText("DRINK ME");

  await page.locator("#ob-question").selectOption("butter-own");
  await expect(page.locator("#stat-4")).toHaveText("No");
  await page.locator("#ob-keep").fill("6");
  await expect(page.locator("#stat-4")).toHaveText("Yes, ranked 6");
  await expect(page.locator("#stat-3")).toHaveText("360");

  await page.locator("#ob-question").selectOption("watch-own");
  await expect(page.locator("#stat-4")).toHaveText("No");
  await expect(page.locator("#ob-prose")).toContainText("“timepiece” and “bunny”");
  expect(errors).toEqual([]);
});

test("the open-book lab scores the search, explains a cut answer, and takes a question of your own", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/open-book-lab.html");
  const status = page.locator("#book-simulation-status");
  await expect(status).toContainText("Current · shared words · 263 passages of 60 words");
  const figure = async (label: string) =>
    Number(
      await page.locator("#book-stats .stat", { hasText: label }).locator("strong").innerText(),
    );
  expect(await figure("Answers found")).toBe(12);
  expect(await figure("book's words")).toBeGreaterThan(await figure("reader's words"));
  await expect(page.locator("#book-ledger tr")).toHaveCount(24);
  await expect(page.locator("#book-prompt")).toContainText("Question: What words were printed");

  await page.locator("#book-question").selectOption("jar");
  await expect(page.locator("#book-outcome")).toContainText("a boundary falls in the middle");
  await page.locator("#book-overlap").selectOption("0.5");
  await expect(status).toContainText("50% overlap");
  await expect(page.locator("#book-outcome")).toContainText("underlined in green");
  expect(await figure("cut in two")).toBe(0);

  await page.locator("#book-own").fill("Who stole the tarts?");
  await page.locator("#book-own").press("Enter");
  await expect(page.locator("#book-asked")).toHaveText("Who stole the tarts?");
  await expect(page.locator("#book-outcome")).toContainText("no answer key");
  await expect(page.locator("#book-outcome")).toContainText("“stole”");

  await page.locator("#book-reset").click();
  await expect(status).toContainText("no overlap");
  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(status).toContainText("passages of 15 words");
  expect(errors).toEqual([]);
});

test("learned word vectors find “tall ≈ height”, and averaging them loses to plain word matching", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/open-book-lab.html");
  const status = page.locator("#book-simulation-status");
  const found = async () =>
    Number(
      await page
        .locator("#book-stats .stat", { hasText: "Answers found" })
        .locator("strong")
        .innerText(),
    );
  await expect(status).toContainText("Current · shared words");
  const plain = await found();

  await page.locator("#book-question").selectOption("height-own");
  await expect(page.locator("#book-outcome")).toContainText("is not in the 3 passages");
  await page.locator("#book-method").selectOption("neighbours");
  await expect(status).toContainText("shared words plus near-meanings", { timeout: 20_000 });
  await expect(page.locator("#book-outcome")).toContainText("“tall” sits nearest");
  await expect(page.locator("#book-passages li.has-answer .why")).toContainText("tall ≈ ");
  await expect(page.locator("#book-description")).toContainText(
    `Matching shared words alone finds ${plain}`,
  );

  await page.locator("#book-method").selectOption("average");
  await expect(status).toContainText("one learned vector per passage");
  expect(await found()).toBeLessThan(plain - 2);
  await expect(page.locator("#book-description")).toContainText("Averaging blurs");
  expect(errors).toEqual([]);
});

test("a passage encoder finds what word matching cannot, and declines a typed question", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/open-book-lab.html");
  const status = page.locator("#book-simulation-status");
  const figure = async (label: string) =>
    Number(
      await page.locator("#book-stats .stat", { hasText: label }).locator("strong").innerText(),
    );
  await expect(status).toContainText("Current · shared words");
  const plainOwn = await figure("reader's words");

  await page.locator("#book-question").selectOption("watch-own");
  await expect(page.locator("#book-outcome")).toContainText("not in the top 10");
  await page.locator("#book-method").selectOption("encoder");
  await expect(status).toContainText("Current · a passage encoder · 263 passages", {
    timeout: 20_000,
  });
  expect(await figure("reader's words")).toBeGreaterThan(plainOwn + 1);
  await expect(page.locator("#book-outcome")).toContainText("passage ranked 4");

  await page.locator("#book-size").fill("5");
  await expect(status).toContainText("a passage encoder · 105 passages of 150 words", {
    timeout: 20_000,
  });
  await expect(page.locator("#book-passages li.has-answer mark")).toContainText("took a watch");

  await page.locator("#book-method").selectOption("both");
  await expect(status).toContainText("shared words and the encoder, merged");
  await expect(page.locator("#book-passages .why").first()).toContainText("combined rank");

  await page.locator("#book-own").fill("Who is late?");
  await page.locator("#book-own").press("Enter");
  await expect(page.locator("#book-outcome")).toContainText("cannot read a question you type");
  expect(errors).toEqual([]);
});

test("a prejudiced past is learned, survives deleting the column, and is invisible to the lender's score", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/fairness-lab.html");
  const status = page.locator("#fair-simulation-status");
  await expect(status).toContainText("Current · 60% prejudice · sees group");
  const figure = async (label: string) =>
    Number(
      (await page.locator("#fair-stats .stat", { hasText: label }).locator("strong").innerText())
        .replace("−", "-")
        .replace(/[^\d.-]/g, ""),
    );
  const seen = await figure("Gap: would repay, and approved");
  expect(seen).toBeGreaterThan(35);
  await expect(page.locator("#fair-outcome")).toContainText("on the group column");
  await expect(page.locator("#fair-ledger tr")).toHaveCount(2);

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="most"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(status).toContainText("no group column");
  await expect(page.locator("#fair-outcome")).toContainText("has found the group again");
  await expect(page.locator("#fair-weights li", { hasText: "neighbourhood" })).toContainText(
    "counts against Orange",
  );

  await page.locator("#fair-proxy").fill("0");
  await expect(status).toContainText("reveals group 0%");
  expect(Math.abs(await figure("Gap: would repay, and approved"))).toBeLessThan(6);
  await expect(page.locator("#fair-outcome")).toContainText("lower approval rate for everybody");
  expect(errors).toEqual([]);
});

test("with a head start no cut-off rule levels everything, and job words lean in real vectors", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/fairness-lab.html");
  const status = page.locator("#fair-simulation-status");
  await page.locator("#fair-prejudice").fill("0");
  await page.locator("#fair-headStart").fill("0.6");
  await page.locator("#fair-policy").selectOption("same-rate");
  await expect(status).toContainText("head start 60% · equal approval rates");
  await expect(
    page.locator("#fair-stats .stat", { hasText: "Gap: approved" }).first(),
  ).toContainText("points");
  await expect(page.locator("#fair-outcome")).toContainText("No setting closes all three");
  await expect(page.locator("#fair-outcome")).toContainText("Separate cut-offs");

  await page.locator("#fair-load").click();
  await expect(page.locator("#fair-leans li")).toHaveCount(36, { timeout: 20_000 });
  await expect(page.locator("#fair-leans li").first()).toContainText("leans towards “he”");
  await expect(page.locator("#fair-leans li").last()).toContainText("leans towards “she”");
  await expect(page.locator("#fair-leans-outcome")).toContainText("Nobody labelled anything");
  expect(errors).toEqual([]);
});

test("a changed reason rots the model while the input monitor stays silent, and stale labels mislead a retrain", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/drift-lab.html");
  const status = page.locator("#drift-simulation-status");
  await expect(status).toContainText("Current · the reason changes, slowly · never retrained");
  const figure = async (label: string) =>
    Number(
      (
        await page.locator("#drift-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/[^\d.]/g, ""),
    );
  expect(await figure("Right in the last month")).toBeLessThan(70);
  expect(await figure("Peak input shift")).toBeLessThan(0.5);
  await expect(page.locator("#drift-outcome")).toContainText("no way to notice");
  await expect(page.locator("#drift-ledger tr")).toHaveCount(30);

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(status).toContainText("the customers change");
  expect(await figure("Peak input shift")).toBeGreaterThan(1);
  expect(await figure("Months over 5 points")).toBe(0);

  await page.locator("#drift-scenario").selectOption("sudden");
  await page.locator("#drift-retraining").selectOption("schedule");
  await page.locator("#drift-labelDelay").fill("6");
  await expect(status).toContainText("retrained every 6 months · labels 6 months late");
  await expect(page.locator("#drift-outcome")).toContainText("learned the old rule again");
  await expect(page.locator("#drift-ledger tr.best-row")).toHaveCount(3);
  await expect(page.locator("#drift-ledger tr.best-row").nth(1)).toContainText(
    "Retrained on months 7 to 12",
  );
  expect(errors).toEqual([]);
});

test("a lab's settings travel in the link, and “Try this” applies a setup", async ({ page }) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto(
    "/drift-lab.html#drift-scenario=customers&drift-retraining=inputs&drift-labelDelay=2",
  );
  const status = page.locator("#drift-simulation-status");
  await expect(status).toContainText(
    "the customers change · retrained when the input monitor rings · labels 2 months late",
  );
  await expect(page.locator("#drift-scenario")).toHaveValue("customers");

  const coach = page.locator("nav.coach");
  await expect(coach.locator(".coach-moves button:not(.share-button)")).toHaveCount(3);
  await coach.locator("button", { hasText: "learned the old world" }).click();
  await expect(status).toContainText(
    "the reason changes overnight · retrained every 6 months · labels 6 months late",
  );
  await expect(coach.locator(".coach-note")).toContainText("Event column");
  await expect(page).toHaveURL(/#drift-scenario=sudden/);

  await page.locator("#drift-reset").click();
  await expect(status).toContainText("the reason changes, slowly · never retrained");
  await expect(page).not.toHaveURL(/#/);

  await page.locator("#drift-labelDelay").fill("4");
  await page.locator(".share-button").click();
  await expect(page).toHaveURL(/#drift-scenario=reason&drift-retraining=never&drift-labelDelay=4/);
  expect(errors).toEqual([]);
});

test("a deep tree memorises, a forest recovers, and boosted stumps cannot do opposite corners", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-10-trees.html");
  await expect(page.locator("#stat-4")).toHaveText("Too simple");
  await page.locator("#tree-depth").fill("12");
  await expect(page.locator("#stat-4")).toHaveText("Memorising");
  await expect(page.locator("#tree-prose")).toContainText("private box");

  await page.goto("/trees-lab.html");
  const status = page.locator("#tree-simulation-status");
  await expect(status).toContainText("Current · the ring · one tree · depth 4");
  const figure = async (label: string) =>
    Number(
      (
        await page.locator("#tree-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/[^\d.]/g, ""),
    );
  const shallow = await figure("Right on unseen");
  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  expect(await figure("Right on unseen")).toBeLessThan(shallow);
  const deepGap = await figure("Gap");
  expect(deepGap).toBeGreaterThan(8);
  await expect(page.locator("#tree-questions .question").first()).toContainText("Is input");

  await page.locator("#tree-method").selectOption("forest");
  await expect(status).toContainText("forest of 50");
  await expect(page.locator("#tree-questions-caption")).toContainText("first of the 50 trees");
  expect(await figure("Gap")).toBeLessThan(deepGap);

  await page.locator("#tree-pattern").selectOption("xor");
  await page.locator("#tree-method").selectOption("boosting");
  await page.locator("#tree-depth").fill("1");
  await page.locator("#tree-count").fill("200");
  await expect(status).toContainText("boosting of 200 · depth 1");
  expect(await figure("Right on unseen")).toBeLessThan(65);
  await expect(page.locator("#tree-outcome")).toContainText("same sign on both");
  expect(errors).toEqual([]);
});

test("k-means finds round groups, its loss always falls with k, and it cannot cut a ring", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-11-clusters.html");
  await expect(page.locator("#stat-4")).toHaveText("Found");
  await page.locator("#clu-shape").selectOption("rings");
  await page.locator("#clu-k").fill("2");
  await expect(page.locator("#stat-4")).toHaveText("Missed");
  await expect(page.locator("#clu-prose")).toContainText("no straight line");

  await page.goto("/cluster-lab.html");
  const status = page.locator("#clu-simulation-status");
  await expect(status).toContainText(
    "Current · three round groups · k = 3 · start random · guess 1 · settled",
  );
  const figure = async (label: string | RegExp) =>
    Number(
      (
        await page.locator("#clu-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/[^\d.]/g, ""),
    );
  expect(await figure("Agreement")).toBeGreaterThan(95);
  const found = await figure(/^Loss/);

  await page.locator("#clu-round").fill("0");
  await expect(status).toContainText("round 0");
  expect(await figure(/^Loss/)).toBeGreaterThan(found);
  await expect(page.locator("#clu-outcome")).toContainText("Round 0 of");
  await page.locator("#clu-round").fill("30");
  await expect(status).toContainText("settled");

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(status).toContainText("k = 8");
  await expect(page.locator("#clu-ledger tr")).toHaveCount(8);

  await page.locator("#clu-k").fill("3");
  await page.locator("#clu-seed").fill("6");
  await expect(status).toContainText("start random · guess 6");
  expect(await figure("Agreement")).toBeLessThan(75);
  await expect(page.locator("#clu-outcome")).toContainText("local minimum");
  expect(errors).toEqual([]);
});

test("filters slide in the lesson, and in the lab they know a moved shape that dense wiring does not", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-12-vision.html");
  await expect(page.locator("#stat-2")).toHaveText("100");
  await page.locator("#see-filter").selectOption("outline");
  await expect(page.locator("#see-prose")).toContainText("outline of a shape");
  await expect(page.locator("#see-map svg rect")).toHaveCount(100);

  await page.goto("/vision-lab.html");
  const status = page.locator("#see-simulation-status");
  await expect(status).toContainText(
    "Current · fully connected · 32 neurons · training shapes centred",
    { timeout: 30_000 },
  );
  const figure = async (label: string) =>
    Number(
      (
        await page.locator("#see-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/[^\d.]/g, ""),
    );
  expect(await figure("Right on centred")).toBeGreaterThan(90);
  expect(await figure("Right on shifted")).toBeLessThan(45);
  await expect(page.locator("#see-gallery li.wrong").first()).toBeVisible();

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="up"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 30_000 });
  await expect(status).toContainText("Current · convolutional · 32 filters");
  expect(await figure("Right on shifted")).toBeGreaterThan(90);
  await expect(page.locator("#see-filters li")).toHaveCount(8);
  await expect(page.locator("#see-filters-caption")).toContainText(
    "first 8 of the 32 learned filters",
  );
  expect(errors).toEqual([]);
});

test("Q-learning walks the edge, SARSA keeps its distance, and exploring near a cliff costs", async ({
  page,
}) => {
  const errors = monitorRuntimeErrors(page);
  await page.goto("/lesson-13-reward.html");
  await expect(page.locator("#stat-4")).toHaveText("The edge route");
  await page.locator("#rl-algorithm").selectOption("sarsa");
  await expect(page.locator("#stat-4")).toHaveText("The safe route");
  await expect(page.locator("#lesson-grid .grid-route")).toBeVisible();

  await page.goto("/reward-lab.html");
  const status = page.locator("#rl-simulation-status");
  await expect(status).toContainText(
    "Current · q-learning · exploration 10% · rate 0.50 · 1000 episodes · run 1",
  );
  const figure = async (label: string) =>
    Number(
      (
        await page.locator("#rl-stats .stat", { hasText: label }).locator("strong").innerText()
      ).replace(/[^\d.-]/g, ""),
    );
  const edge = await figure("Route reward");
  expect(edge).toBeGreaterThanOrEqual(10);
  await expect(page.locator("#rl-outcome")).toContainText("edge route");

  const card = page.locator("#predict");
  await card.locator('.predict-choices button[data-choice="down"]').click();
  await card.locator(".predict-reveal").click();
  await expect(card.locator(".predict-feedback")).toContainText("Right.", { timeout: 15_000 });
  await expect(status).toContainText("Current · sarsa");
  expect(await figure("Route reward")).toBeLessThan(edge);
  await expect(page.locator("#rl-outcome")).toContainText("clear of the cliff");

  await page.locator("#rl-exploration").fill("0.3");
  await expect(status).toContainText("exploration 30%");
  expect(await figure("Falls per 100")).toBeGreaterThan(10);
  await expect(page.locator("#rl-ledger tr")).toHaveCount(10);
  expect(errors).toEqual([]);
});
