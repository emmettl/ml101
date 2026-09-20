import { NAIVE, modelCard, runCapstone, type Decisions, type Outcome } from "../capstone/engine";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { markLastLocation } from "../shared/progress";

interface Params extends Record<string, number | string> {
  split: Decisions["split"];
  leak: "in" | "out";
  capacity: Decisions["capacity"];
  metric: Decisions["metric"];
  threshold: number;
}

const toParams = (decisions: Decisions): Params => ({
  split: decisions.split,
  leak: decisions.includeLeak ? "in" : "out",
  capacity: decisions.capacity,
  metric: decisions.metric,
  threshold: decisions.threshold,
});

// The learner starts where a rushed project would, and has to earn "ready".
const params: Params = toParams(NAIVE);

const decisions = (): Decisions => ({
  split: params.split,
  includeLeak: params.leak === "in",
  capacity: params.capacity,
  metric: params.metric,
  threshold: params.threshold,
});

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "split",
    label: "1 · How will you score it?",
    options: [
      { value: "none", label: "Train on all 600, score on the same 600" },
      { value: "two-way", label: "Train on 480, score on the other 120" },
      { value: "three-way", label: "Train on 360, tune on 120, score once on a final 120" },
    ],
  },
  {
    type: "select",
    key: "leak",
    label: "2 · Use the column “win-back offer sent”?",
    options: [
      { value: "in", label: "Yes: it is by far the strongest predictor" },
      { value: "out", label: "No: leave it out" },
    ],
    help: "Ask when this column gets filled in, and by whom.",
  },
  {
    type: "select",
    key: "capacity",
    label: "3 · Which other inputs?",
    options: [
      { value: "bloated", label: "All 43 columns: let the model sort it out" },
      { value: "lean", label: "The 3 that plausibly matter" },
    ],
  },
  {
    type: "select",
    key: "metric",
    label: "4 · Which number goes in the headline?",
    options: [
      { value: "accuracy", label: "Accuracy" },
      { value: "cancellers", label: "Share of cancellers caught" },
    ],
  },
  {
    type: "range",
    key: "threshold",
    label: "5 · Flag a customer at confidence…",
    min: 0.05,
    max: 0.9,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
    help: "Lower catches more cancellers and rings more people who were never going to leave.",
  },
];

const chart = byId<SVGSVGElement>("cap-chart");
const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;
let latest: Outcome | undefined;
let frame = 0;

function drawChart(outcome: Outcome): void {
  const groups = [
    {
      label: "Accuracy",
      reported: outcome.reported.accuracy,
      live: outcome.deployment.accuracy,
      idle: 1 - outcome.baseRate,
    },
    {
      label: "Cancellers caught",
      reported: outcome.reported.recall,
      live: outcome.deployment.recall,
      idle: 0,
    },
    {
      label: "Flags that were right",
      reported: outcome.reported.precision,
      live: outcome.deployment.precision,
      idle: outcome.baseRate,
    },
  ];
  const plot = createPlot(chart, {
    base: { width: 900, height: 300 },
    xRange: [0, groups.length],
    yRange: [0, 1],
    xTicks: [],
    yTicks: [0, 0.25, 0.5, 0.75, 1],
    yFormat: percent,
  });
  groups.forEach((group, index) => {
    plot.box(index + 0.2, 0, index + 0.48, group.reported, "plot-bar");
    plot.box(index + 0.52, 0, index + 0.8, group.live, "plot-bar chosen");
    plot.line(
      [
        [index + 0.12, group.idle],
        [index + 0.88, group.idle],
      ],
      "best",
    );
    plot.text(index + 0.34, group.reported + 0.03, percent(group.reported), "plot-label strong");
    plot.text(index + 0.66, group.live + 0.03, percent(group.live), "plot-label strong");
    plot.text(index + 0.5, -0.09, group.label, "plot-label");
  });
}

function narrative(outcome: Outcome): string {
  const drop = outcome.headline.reported - outcome.headline.deployment;
  const start = `You would have reported ${percent(outcome.headline.reported)} ${outcome.headline.label}, scored on ${outcome.scoredOn}.`;
  if (params.leak === "in")
    return `${start} On new customers the model catches ${percent(outcome.deployment.recall)} of cancellers. It had learned one rule, “an offer was sent, so they cancelled”, and at the moment a prediction is needed no offers have been sent. The archive contained the answer; real life does not.`;
  if (drop > 0.1)
    return `${start} In deployment that falls to ${percent(outcome.headline.deployment)}. The score was earned on customers the model had already seen, or was tuned on, so part of it was memory.`;
  if (!outcome.ready)
    return `${start} Deployment delivers ${percent(outcome.headline.deployment)}, so the number is honest. It is not yet a model to be proud of: see which checks below are still pending.`;
  return `${start} On 4,000 new customers it delivers ${percent(outcome.headline.deployment)}: it catches ${percent(outcome.deployment.recall)} of those who cancel, and ${percent(outcome.deployment.precision)} of the people it flags really were leaving, against ${percent(outcome.baseRate)} by chance. A modest, honest, useful model, which is what a good one usually looks like.`;
}

function render(): void {
  const chosen = decisions();
  const outcome = runCapstone(chosen);
  latest = outcome;
  const passed = outcome.checks.filter((check) => check.passed).length;
  drawChart(outcome);
  renderStats(byId("cap-stats"), [
    { label: `Reported ${outcome.headline.label}`, value: percent(outcome.headline.reported) },
    {
      label: "The same, in deployment",
      value: percent(outcome.headline.deployment),
      tone: outcome.headline.reported - outcome.headline.deployment > 0.1 ? "bad" : "good",
    },
    { label: "Cancellers caught, deployed", value: percent(outcome.deployment.recall) },
    {
      label: "Checks passed",
      value: `${passed} of ${outcome.checks.length}`,
      tone: outcome.ready ? "good" : undefined,
    },
  ]);
  byId("cap-status").textContent = outcome.ready ? "Ready to ship" : "Not ready";
  byId("cap-summary").textContent = outcome.ready
    ? "Every check passes. The score is honest, the inputs will exist when needed, and the model beats doing nothing on the measure that matters."
    : `${outcome.checks.length - passed} of ${outcome.checks.length} checks are still pending. Change one decision at a time and watch which rows flip.`;
  byId("cap-outcome").textContent = narrative(outcome);
  byId("cap-simulation-status").textContent =
    `Current · trained on ${outcome.training.count} customers · reported on ${outcome.reported.count} · deployed on ${outcome.deployment.count.toLocaleString("en-GB")} · flagging at ${percent(chosen.threshold)} confidence`;

  byId("cap-checks").replaceChildren(
    ...outcome.checks.map((check) => {
      const tr = document.createElement("tr");
      tr.dataset.check = check.id;
      const cells = [check.question, check.passed ? "Passed" : "Pending", check.detail];
      cells.forEach((text, column) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (column === 1) cell.className = check.passed ? "event-positive" : "event-negative";
        tr.append(cell);
      });
      return tr;
    }),
  );
  byId("cap-card").textContent = modelCard(chosen, outcome);
  if (outcome.ready)
    markLastLocation({ kind: "lab", href: location.pathname, label: "the capstone" });
}

function schedule(): void {
  byId("cap-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => window.setTimeout(render, 0));
}

const panel = renderControls(byId("cap-controls"), "cap", controls, params, schedule);

byId("cap-reset").addEventListener("click", () => {
  Object.assign(params, toParams(NAIVE));
  panel.sync();
  render();
});
byId("cap-copy").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("cap-copy");
  try {
    await navigator.clipboard.writeText(byId("cap-card").textContent ?? "");
    button.textContent = "Copied";
  } catch {
    button.textContent = "Select the text and copy it";
  }
  window.setTimeout(() => (button.textContent = "Copy model card"), 2000);
});

render();
redrawOnResize([chart], () => latest && drawChart(latest));
initLabPage();
