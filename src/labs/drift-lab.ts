import {
  ACCURACY_ALARM,
  BREAK_MONTH,
  MONTHS,
  SCHEDULE,
  SHIFT_ALARM,
  TRAINING_MONTHS,
  simulate,
  type Retraining,
  type Run,
  type Scenario,
} from "../drift/engine";
import source from "../drift/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

interface Params extends Record<string, number | string> {
  scenario: string;
  retraining: string;
  labelDelay: number;
}

const defaults: Params = { scenario: "reason", retraining: "never", labelDelay: 3 };
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const SCENARIO_NAMES: Record<Scenario, string> = {
  steady: "nothing changes",
  customers: "the customers change",
  reason: "the reason changes, slowly",
  sudden: "the reason changes overnight",
};
const RULE_NAMES: Record<Retraining, string> = {
  never: "never retrained",
  schedule: `retrained every ${SCHEDULE} months`,
  inputs: "retrained when the input monitor rings",
  accuracy: "retrained when accuracy falls",
};

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "scenario",
    label: "What happens after launch",
    options: [
      { value: "steady", label: "Nothing changes" },
      { value: "customers", label: "The customers change: a new app, younger accounts" },
      { value: "reason", label: "The reason changes, slowly: tickets stop meaning trouble" },
      { value: "sudden", label: "The reason changes overnight, a year after launch" },
    ],
  },
  {
    type: "select",
    key: "retraining",
    label: "When the model is retrained",
    options: [
      { value: "never", label: "Never" },
      { value: "schedule", label: `Every ${SCHEDULE} months, on a schedule` },
      { value: "inputs", label: "When the inputs drift too far from the training data" },
      {
        value: "accuracy",
        label: `When accuracy falls ${ACCURACY_ALARM * 100} points below launch`,
      },
    ],
    help: "Retraining uses the last six months of labelled data, and cannot happen until six new months of it exist.",
  },
  {
    type: "range",
    key: "labelDelay",
    label: "Months until you learn who cancelled",
    min: 0,
    max: 6,
    step: 1,
    format: (value) => (value === 0 ? "at once" : `${value} month${value === 1 ? "" : "s"}`),
    help: "A prediction is made today. Whether it was right is known only once the customer has stayed or gone.",
  },
];

const accuracyChart = byId<SVGSVGElement>("drift-accuracy");
const monitorChart = byId<SVGSVGElement>("drift-monitor");
let run: Run;
let frame = 0;

function drawAccuracy(): void {
  const plot = createPlot(accuracyChart, {
    base: { width: 900, height: 300 },
    xRange: [TRAINING_MONTHS, MONTHS - 1],
    yRange: [50, 90],
    xLabel: "Month after launch",
    yLabel: "Right this month",
    yTicks: [50, 60, 70, 80, 90],
    yFormat: (value) => `${value}%`,
    xFormat: (value) => String(value - TRAINING_MONTHS + 1),
  });
  plot.guide("y", run.launchAccuracy * 100, `at launch: ${percent(run.launchAccuracy)}`, "calm");
  for (const month of run.months)
    if (month.retrained) plot.guide("x", month.month, "retrained", "calm", "plot-label");
  plot.line(
    run.months.map((month) => [month.month, month.ceiling * 100] as const),
    "truth",
  );
  const known = run.months.filter((month) => month.labelled);
  const unknown = run.months.filter((month) => !month.labelled);
  plot.line(
    known.map((month) => [month.month, month.accuracy * 100] as const),
    "train",
  );
  if (unknown.length > 0)
    plot.line(
      [known.at(-1), ...unknown]
        .filter((month) => month !== undefined)
        .map((month) => [month.month, month.accuracy * 100] as const),
      "held thin",
    );
}

function drawMonitor(): void {
  const plot = createPlot(monitorChart, {
    base: { width: 900, height: 200 },
    xRange: [TRAINING_MONTHS, MONTHS - 1],
    yRange: [0, 1.4],
    xLabel: "Month after launch",
    yLabel: "Input shift",
    yTicks: [0, 0.5, 1],
    xFormat: (value) => String(value - TRAINING_MONTHS + 1),
  });
  plot.guide("y", SHIFT_ALARM, `alarm at ${SHIFT_ALARM}`, "warn", "plot-label warn");
  plot.line(
    run.months.map((month) => [month.month, month.shift] as const),
    "path",
  );
  for (const month of run.months) if (month.retrained) plot.guide("x", month.month, "", "calm");
}

function story(): string {
  const months = run.months;
  const last = months.at(-1);
  if (!last) return "";
  const shortfall = months.map((month) => month.ceiling - month.accuracy);
  const bad = shortfall.filter((value) => value > 0.05).length;
  const peakShift = Math.max(...months.map((month) => month.shift));
  const parts: string[] = [];
  const scenario = params.scenario as Scenario;
  if (scenario === "steady")
    parts.push(
      `Nothing moved, and the model held: ${percent(last.accuracy)} right in the last month against ${percent(run.launchAccuracy)} at launch. The wobble from month to month is sampling noise on 800 customers, which is worth knowing before you read anything into a one-month dip.${run.retrains > 0 ? ` The ${run.retrains} retrain${run.retrains === 1 ? "" : "s"} changed nothing, and cost something.` : ""}`,
    );
  if (scenario === "customers")
    parts.push(
      `The customers drifted a long way: by the end the inputs sit ${peakShift.toFixed(1)} standard deviations from where the model was trained, and it flags ${percent(last.flagged)} of them where it once flagged ${percent(months[0].flagged)}. Yet its accuracy is ${percent(last.accuracy)}, ${bad === 0 ? "never more than 5 points below the best possible" : `more than 5 points below the best possible in ${bad} months`}. It learned the right rule, and the rule did not change; new people, same rule. The input monitor ${peakShift > SHIFT_ALARM ? "rang anyway" : "stayed quiet"}.`,
    );
  if (scenario === "reason" || scenario === "sudden")
    parts.push(
      `The customers look exactly as they always did: the input monitor never rose above ${peakShift.toFixed(2)}. What changed is what a support ticket means, and the model has no way to notice. ${params.retraining === "never" ? `Its accuracy slid from ${percent(run.launchAccuracy)} to ${percent(last.accuracy)}, while a model that knew the new rule would have scored ${percent(last.ceiling)}.` : `${bad === 0 ? "Retraining kept it within 5 points of the best possible throughout." : `It was more than 5 points below the best possible in ${bad} of ${months.length} months.`}`}`,
    );
  if (params.retraining === "inputs" && (scenario === "reason" || scenario === "sudden"))
    parts.push(
      "The retraining rule watches the inputs, and the inputs are fine. It will never fire. This is the failure that input monitoring cannot catch, and it is the common one.",
    );
  if (params.retraining === "accuracy" && params.labelDelay > 0) {
    const late = `${params.labelDelay} month${params.labelDelay === 1 ? "" : "s"}`;
    const fixedAt = months.find((month) => month.retrained);
    parts.push(
      `Accuracy can only be measured once the labels arrive, ${late} late, so the alarm is always looking ${late} into the past.${scenario === "sudden" && fixedAt ? ` The rule broke in month ${BREAK_MONTH - TRAINING_MONTHS + 1}; the first retrain came in month ${fixedAt.month - TRAINING_MONTHS + 1}.` : ""}`,
    );
  }
  // A retrain after the break whose labelled data all came from before it.
  const staleRetrain = months
    .filter(
      (month) =>
        month.retrained &&
        month.month >= BREAK_MONTH &&
        month.month - params.labelDelay <= BREAK_MONTH,
    )
    .at(-1);
  if (staleRetrain && scenario === "sudden")
    parts.push(
      `The retrain in month ${staleRetrain.month - TRAINING_MONTHS + 1} used the newest labelled data there was, and all of it came from before the change. It learned the old rule again. The next retrain, once six post-change months had labels, is the one that fixed it.`,
    );
  const unlabelled = months.filter((month) => !month.labelled).length;
  if (unlabelled > 0)
    parts.push(
      `The dashed end of the accuracy curve is the last ${unlabelled} month${unlabelled === 1 ? "" : "s"}: the lab can score them, but the team cannot yet.`,
    );
  return parts.join(" ");
}

function draw(): void {
  run = simulate({
    scenario: params.scenario as Scenario,
    retraining: params.retraining as Retraining,
    labelDelay: params.labelDelay,
  });
  const months = run.months;
  const last = months.at(-1);
  if (!last) return;
  const shortfall = months.map((month) => month.ceiling - month.accuracy);
  const bad = shortfall.filter((value) => value > 0.05).length;
  const lowest = Math.min(...months.map((month) => month.accuracy));
  drawAccuracy();
  drawMonitor();
  renderStats(byId("drift-stats"), [
    { label: "Right at launch", value: percent(run.launchAccuracy) },
    {
      label: "Right in the last month",
      value: percent(last.accuracy),
      tone: last.accuracy < run.launchAccuracy - 0.05 ? "bad" : "good",
    },
    { label: "Lowest month", value: percent(lowest) },
    {
      label: "Months over 5 points below the best possible",
      value: String(bad),
      tone: bad > 0 ? "bad" : "good",
    },
    { label: "Times retrained", value: String(run.retrains) },
    {
      label: "Peak input shift",
      value: Math.max(...months.map((month) => month.shift)).toFixed(2),
    },
  ]);

  byId("drift-ledger").replaceChildren(
    ...months.map((month) => {
      const row = document.createElement("tr");
      if (month.retrained) row.className = "best-row";
      // Retraining used the six labelled months up to (month − delay), in engine numbering.
      const upTo = month.month - params.labelDelay;
      const event = month.retrained
        ? `Retrained on months ${upTo - TRAINING_MONTHS - TRAINING_MONTHS + 1} to ${upTo - TRAINING_MONTHS}`
        : month.alarm
          ? "Alarm, but too little new labelled data"
          : "";
      const cells = [
        String(month.month - TRAINING_MONTHS + 1),
        percent(month.cancelRate),
        percent(month.flagged),
        month.shift.toFixed(2),
        month.labelled ? percent(month.accuracy) : `${percent(month.accuracy)} (labels not in yet)`,
        percent(month.ceiling),
        event,
      ];
      row.append(
        ...cells.map((value, column) => {
          const cell = document.createElement(column === 0 ? "th" : "td");
          if (column === 0) cell.scope = "row";
          cell.textContent = value;
          return cell;
        }),
      );
      return row;
    }),
  );

  byId("drift-outcome").textContent = story();
  byId("drift-name").textContent =
    `${SCENARIO_NAMES[params.scenario as Scenario]}, ${RULE_NAMES[params.retraining as Retraining]}`;
  byId("drift-description").textContent =
    `Trained once on ${TRAINING_MONTHS} months, then run for ${months.length} more. Labels arrive ${params.labelDelay === 0 ? "at once" : `${params.labelDelay} month${params.labelDelay === 1 ? "" : "s"} late`}. ${percent(run.launchAccuracy)} right at launch, ${percent(last.accuracy)} in the last month, against a best possible of ${percent(last.ceiling)}.`;
  byId("drift-simulation-status").textContent =
    `Current · ${SCENARIO_NAMES[params.scenario as Scenario]} · ${RULE_NAMES[params.retraining as Retraining]} · labels ${params.labelDelay === 0 ? "at once" : `${params.labelDelay} months late`} · ${months.length} months after launch`;
}

function schedule(): void {
  byId("drift-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

const panel = renderControls(byId("drift-controls"), "drift", controls, params, schedule);

byId("drift-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  schedule();
});

mountCodePeek(byId("code-peek"), {
  summary: "training, prediction and the input monitor, which needs no labels",
  source,
  marker: "drift",
  pythonCaption: "The same monitor in production, roughly",
  python: `import numpy as np

# Saved at training time: where each input sat.
train_means, train_spreads = X_train.mean(axis=0), X_train.std(axis=0)

def input_shift(X_this_month):
    """How far this month's inputs are from the training data, in standard deviations."""
    return np.mean(np.abs(X_this_month.mean(axis=0) - train_means) / train_spreads)

# Run every month, with no labels needed. Alarm when it passes 0.5.
# Then, once the labels arrive, the check that actually matters:
accuracy_this_month = (model.predict(X_months_ago) == y_months_ago).mean()
if accuracy_this_month < accuracy_at_launch - 0.05:
    retrain(on=last_six_labelled_months)`,
});

draw();
redrawOnResize([accuracyChart, monitorChart], () => {
  drawAccuracy();
  drawMonitor();
});
initLabPage();
