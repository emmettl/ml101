import {
  LADDER,
  LADDER_NOTE,
  acceleratorDays,
  bytesInWords,
  durationInWords,
  inWords,
  readingYears,
  sensibleTokens,
  trainingOperations,
  weightBytes,
} from "../scale/engine";
import source from "../scale/engine.ts?raw";
import { drawLadder } from "../scale/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

interface Params extends Record<string, number | string> {
  parameters: number;
  tokensPerParameter: number;
  bytes: number;
  accelerators: number;
}

const defaults: Params = { parameters: 1e9, tokensPerParameter: 20, bytes: 2, accelerators: 1000 };
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "parameters",
    label: "Knobs (parameters)",
    min: 2,
    max: 12,
    step: 0.05,
    toParam: (position) => 10 ** position,
    fromParam: (value) => Math.log10(value),
    format: (value) => inWords(value),
    help: "Each notch multiplies the size. The slider runs from a hundred to a trillion.",
  },
  {
    type: "range",
    key: "tokensPerParameter",
    label: "Tokens read per knob",
    min: 0,
    max: 2.5,
    step: 0.05,
    toParam: (position) => Math.round(10 ** position),
    fromParam: (value) => Math.log10(value),
    format: (value) => String(value),
    help: "About 20 is the usual rule. GPT-3 read under 2; recent small models read a thousand or more.",
  },
  {
    type: "select",
    key: "bytes",
    label: "Storage per knob",
    options: [
      { value: "4", label: "4 bytes: full precision" },
      { value: "2", label: "2 bytes: usual for training" },
      { value: "1", label: "1 byte: compressed for use" },
      { value: "0.5", label: "Half a byte: squeezed to fit a laptop" },
    ],
  },
  {
    type: "range",
    key: "accelerators",
    label: "Accelerators working together",
    min: 0,
    max: 5,
    step: 0.05,
    toParam: (position) => Math.round(10 ** position),
    fromParam: (value) => Math.log10(value),
    format: (value) => value.toLocaleString("en-GB"),
  },
];

const ladderChart = byId<SVGSVGElement>("ladder-chart");
const costChart = byId<SVGSVGElement>("ladder-cost-chart");

const power = (value: number): string => {
  const exponent = Math.floor(Math.log10(value));
  return `${(value / 10 ** exponent).toFixed(1)} × 10^${exponent}`;
};

function render(): void {
  const tokens = sensibleTokens(params.parameters, params.tokensPerParameter);
  const operations = trainingOperations(params.parameters, tokens);
  const days = acceleratorDays(operations) / params.accelerators;
  const memory = weightBytes(params.parameters, params.bytes);

  drawLadder(ladderChart, -1, { name: "Your model", parameters: params.parameters });

  const plot = createPlot(costChart, {
    base: { width: 900, height: 300 },
    xRange: [2, 12],
    yRange: [1e6, 1e27],
    yLog: true,
    xLabel: "Knobs",
    yLabel: "Training arithmetic (operations)",
    xTicks: [3, 6, 9, 12],
    xFormat: (value) => inWords(10 ** value),
    yTicks: [1e6, 1e12, 1e18, 1e24],
    yFormat: (value) => inWords(value),
  });
  const curve = Array.from({ length: 41 }, (_, index) => {
    const size = 10 ** (2 + index / 4);
    return [
      Math.log10(size),
      trainingOperations(size, sensibleTokens(size, params.tokensPerParameter)),
    ] as const;
  });
  plot.line(curve, "train");
  for (const rung of LADDER)
    if (rung.tokens)
      plot
        .text(
          Math.log10(rung.parameters),
          trainingOperations(rung.parameters, rung.tokens),
          rung.name,
          "plot-label",
          "end",
        )
        .setAttribute("dx", "-8");
  for (const rung of LADDER)
    if (rung.tokens)
      plot.circle(Math.log10(rung.parameters), trainingOperations(rung.parameters, rung.tokens), 4);
  plot.circle(Math.log10(params.parameters), operations, 7, "here");

  renderStats(byId("ladder-stats"), [
    { label: "Tokens to read", value: inWords(tokens) },
    { label: "Training arithmetic", value: `${power(operations)} operations` },
    { label: "Time to train", value: durationInWords(days) },
    { label: "Memory for the knobs", value: bytesInWords(memory) },
  ]);
  byId("ladder-name").textContent = `${inWords(params.parameters)} knobs`;
  const nearest = LADDER.reduce((best, rung) =>
    Math.abs(Math.log10(rung.parameters / params.parameters)) <
    Math.abs(Math.log10(best.parameters / params.parameters))
      ? rung
      : best,
  );
  byId("ladder-description").textContent =
    `Closest on the ladder: ${nearest.name}${nearest.year ? ` (${nearest.year})` : ""}, at ${inWords(nearest.parameters)}. ${nearest.note}`;
  byId("ladder-simulation-status").textContent =
    `Current · ${inWords(params.parameters)} knobs × ${params.tokensPerParameter} tokens each × 6 operations · ${params.accelerators.toLocaleString("en-GB")} accelerators at 4 × 10^14 useful operations a second · ${params.bytes} bytes per knob`;

  const fits =
    memory <= 16e9
      ? "That fits in the memory of a laptop."
      : memory <= 80e9
        ? "That fits on one data-centre accelerator, and on nothing you own."
        : `That needs at least ${Math.ceil(memory / 80e9)} data-centre accelerators just to hold it, before it does any work.`;
  byId("ladder-outcome").textContent =
    `A model with ${inWords(params.parameters)} knobs, fed ${params.tokensPerParameter} tokens per knob, reads ${inWords(tokens)} tokens: ${durationInWords(readingYears(tokens) * 365)} of reading for a person at eight hours a day. Training takes ${inWords(operations)} arithmetic operations, which is ${durationInWords(days)} on ${params.accelerators.toLocaleString("en-GB")} accelerator${params.accelerators === 1 ? "" : "s"}. The knobs alone occupy ${bytesInWords(memory)}. ${fits}`;

  byId("ladder-ledger").replaceChildren(
    ...LADDER.map((rung) => {
      const tr = document.createElement("tr");
      if (rung === nearest) tr.classList.add("selected-observation");
      const work = rung.tokens ? trainingOperations(rung.parameters, rung.tokens) : undefined;
      [
        rung.name,
        rung.year ? String(rung.year) : "this course",
        inWords(rung.parameters),
        rung.tokens ? inWords(rung.tokens) : "–",
        rung.tokens ? (rung.tokens / rung.parameters).toFixed(1) : "–",
        work ? power(work) : "–",
        work ? inWords(acceleratorDays(work) / 365) : "–",
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.append(cell);
      });
      return tr;
    }),
  );
  byId("ladder-note").textContent = LADDER_NOTE;
}

const panel = renderControls(byId("ladder-controls"), "ladder", controls, params, () => render());
byId("ladder-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  render();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole planning model is five one-liners",
  source,
  marker: "scale",
  python: `knobs = 70e9
tokens = 20 * knobs                    # about twenty tokens per knob
operations = 6 * knobs * tokens        # forward and backward passes
chip = 4e14                            # useful operations per second, per accelerator

days = operations / chip / 86_400 / 1000   # on a thousand accelerators
memory_gb = knobs * 2 / 1e9                # two bytes per knob

print(f"{operations:.1e} operations, {days:.0f} days, {memory_gb:.0f} GB")
# 5.9e+23 operations, 17 days, 140 GB`,
});

render();
redrawOnResize([ladderChart, costChart], render);
initLabPage();
