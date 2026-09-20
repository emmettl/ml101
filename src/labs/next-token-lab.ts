import corpus from "../data/alice.txt?raw";
import {
  copiedShare,
  normalise,
  predictNext,
  realWordShare,
  reshape,
  sample,
  vocabularyOf,
} from "../language/ngram";
import source from "../language/ngram.ts?raw";
import { renderGenerated, renderOdds, showContext } from "../language/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { nextSeed, seededRandom, type Random } from "../shared/random";
import { createTransport } from "../shared/transport";

const text = normalise(corpus);
const vocabulary = vocabularyOf(text);
const SUMMARY_LENGTH = 600;
const SWEEP_LENGTH = 320;
const SWEEP_CONTEXTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];
const LIVE_LIMIT = 500;
const SUMMARY_SEED = 4;

interface Params extends Record<string, number | string> {
  context: number;
  temperature: number;
  topK: number;
  prompt: string;
  speed: number;
}

const defaults: Params = { context: 5, temperature: 1, topK: 33, prompt: "alice ", speed: 20 };
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "context",
    label: "Characters of context",
    min: 0,
    max: 12,
    step: 1,
    format: (value) => String(value),
    help: "How much of the text so far the model may look at when it guesses.",
  },
  {
    type: "range",
    key: "temperature",
    label: "Temperature",
    min: 0.1,
    max: 2.5,
    step: 0.1,
    format: (value) => value.toFixed(1),
    help: "Below 1 favours the likeliest character. Above 1 gives long shots a real chance.",
  },
  {
    type: "range",
    key: "topK",
    label: "Top-k: consider only the likeliest",
    min: 1,
    max: 33,
    step: 1,
    format: (value) => (value >= 33 ? "all 33" : String(value)),
    help: "At 1 the model always takes the favourite and never surprises itself.",
  },
  {
    type: "select",
    key: "prompt",
    label: "Starting prompt",
    options: [
      { value: "alice ", label: "alice …" },
      { value: "the white rabbit ", label: "the white rabbit …" },
      { value: "said the ", label: "said the …" },
      { value: "down the ", label: "down the …" },
    ],
  },
  {
    type: "select",
    key: "speed",
    label: "Writing speed",
    options: [
      { value: "5", label: "Slow: 5 characters a second" },
      { value: "20", label: "Normal: 20 characters a second" },
      { value: "120", label: "Fast: 120 characters a second" },
    ],
  },
];

const sweepChart = byId<SVGSVGElement>("lm-sweep-chart");
const playButton = byId<HTMLButtonElement>("lm-play");

let liveSeed = 11;
let random: Random = seededRandom(liveSeed);
let written = "";
let lastPick: { token: string; chance: number; options: number; backedOff: number } | undefined;

interface Scored {
  context: number;
  sample: string;
  real: number;
  copied: number;
  options: number;
  distinct: number;
}

let sweep: Scored[] = [];
let sweepJob = 0;

/** Generate and score in one pass, also tracking how many continuations were on offer. */
function write(context: number, length: number, seed: number): Scored {
  const dice = seededRandom(seed);
  let output = params.prompt;
  let options = 0;
  let steps = 0;
  for (let index = 0; index < length; index += 1) {
    const prediction = predictNext(text, output, context);
    if (!prediction.choices.length) break;
    options += Math.min(prediction.choices.length, params.topK);
    steps += 1;
    output += sample(reshape(prediction.choices, params.temperature, params.topK), dice);
  }
  const generated = output.slice(params.prompt.length);
  return {
    context,
    sample: generated,
    real: realWordShare(vocabulary, generated),
    copied: copiedShare(text, generated),
    options: steps ? options / steps : 0,
    distinct: new Set(generated.split(/[^a-z']+/).filter(Boolean)).size,
  };
}

function reading(row: Scored): string {
  if (row.copied > 0.5) return "Reciting";
  if (row.real > 0.95) return "Composing";
  if (row.real > 0.6) return "Nearly words";
  return row.real > 0.25 ? "Word-shaped" : "Noise";
}

const percent = (share: number): string => `${(share * 100).toFixed(0)}%`;

function restartLive(): void {
  random = seededRandom(liveSeed);
  written = "";
  lastPick = undefined;
}

function stepLive(): boolean {
  const prediction = predictNext(text, params.prompt + written, params.context);
  if (!prediction.choices.length) return false;
  const odds = reshape(prediction.choices, params.temperature, params.topK);
  const token = sample(odds, random);
  lastPick = {
    token,
    chance: odds.find((choice) => choice.token === token)?.probability ?? 0,
    options: odds.length,
    backedOff: prediction.backedOff,
  };
  written += token;
  return written.length < LIVE_LIMIT;
}

const transport = createTransport({
  step: stepLive,
  draw: drawLive,
  rate: () => params.speed,
  limit: LIVE_LIMIT,
  onState: (running) => {
    playButton.textContent = running ? "Pause" : "Write";
  },
});

function liveOutcome(): string {
  const prediction = predictNext(text, params.prompt + written, params.context);
  const odds = reshape(prediction.choices, params.temperature, params.topK);
  const favourite = odds[0];
  const name = (token: string) => (token === " " ? "a space" : `“${token}”`);
  const seen =
    prediction.context === ""
      ? "With no context it falls back on how common each character is in the whole book."
      : `The model can see ${showContext(prediction.context)}, which occurs ${prediction.occurrences.toLocaleString("en-GB")} time${prediction.occurrences === 1 ? "" : "s"} in the book.`;
  const backed = prediction.backedOff
    ? ` It wanted ${params.context} characters, but that exact run never appears, so it dropped the oldest ${prediction.backedOff}.`
    : "";
  const choice =
    prediction.choices.length === 1
      ? ` Only one thing ever followed it: ${name(favourite.token)}. There is nothing to choose between, so whatever the temperature, this step is recitation.`
      : ` ${prediction.choices.length} different characters followed it; after your sampler settings the favourite is ${name(favourite.token)} at ${percent(favourite.probability)}.`;
  const previous = lastPick
    ? ` Last step it picked ${name(lastPick.token)}, which had a ${percent(lastPick.chance)} chance.`
    : "";
  return `${seen}${backed}${choice}${previous}`;
}

function drawLive(): void {
  renderGenerated(byId("lm-output"), text, params.prompt, written);
  const prediction = predictNext(text, params.prompt + written, params.context);
  renderOdds(
    byId("lm-odds"),
    prediction.choices,
    reshape(prediction.choices, params.temperature, params.topK),
  );
  byId("lm-odds-caption").textContent =
    `Odds for the next character, given ${showContext(prediction.context)}`;
  byId("lm-outcome").textContent = liveOutcome();
}

function drawSweep(): void {
  const plot = createPlot(sweepChart, {
    base: { width: 900, height: 280 },
    xRange: [0, 12],
    yRange: [0, 100],
    xLabel: "Characters of context",
    yLabel: "Share of the output",
    xTicks: [0, 2, 4, 6, 8, 10, 12],
    xFormat: (value) => String(value),
    yFormat: (value) => `${value}%`,
  });
  plot.guide("x", params.context, `now: ${params.context}`, "calm", "strong");
  if (sweep.length > 1) {
    plot.line(
      sweep.map((row) => [row.context, row.real * 100] as const),
      "train",
    );
    plot.line(
      sweep.map((row) => [row.context, row.copied * 100] as const),
      "held",
    );
  }
}

function drawLedger(): void {
  byId("lm-ledger").replaceChildren(
    ...sweep.map((row) => {
      const tr = document.createElement("tr");
      if (row.context === params.context) tr.classList.add("selected-observation");
      const label = reading(row);
      [
        String(row.context),
        `${row.sample.slice(0, 64)}…`,
        percent(row.real),
        percent(row.copied),
        row.options.toFixed(1),
        label,
      ].forEach((value, column) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (column === 5)
          cell.className =
            label === "Composing"
              ? "event-positive"
              : label === "Reciting"
                ? "event-negative"
                : "event-neutral";
        tr.append(cell);
      });
      return tr;
    }),
  );
}

/** The headline numbers are instant; the ten-way sweep runs in slices so the page stays live. */
function summarise(): void {
  const job = (sweepJob += 1);
  const status = byId("lm-simulation-status");
  status.textContent = "Calculating…";
  const now = write(params.context, SUMMARY_LENGTH, SUMMARY_SEED);
  const label = reading(now);
  renderStats(byId("lm-stats"), [
    { label: "Real words", value: percent(now.real) },
    {
      label: "Copied from the book",
      value: percent(now.copied),
      tone: now.copied > 0.5 ? "bad" : undefined,
    },
    {
      label: "Different words",
      value: String(now.distinct),
      tone: now.distinct < 20 ? "bad" : undefined,
    },
    { label: "Reading", value: label, tone: label === "Composing" ? "good" : undefined },
  ]);
  byId("lm-name").textContent =
    `${params.context} character${params.context === 1 ? "" : "s"} of context`;
  byId("lm-description").textContent =
    now.distinct < 20 && params.context > 0
      ? "Stuck in a loop. Always taking the likeliest character leads back to a phrase it has already written, and from there the same choices repeat for ever. Real language models do this too when sampling is too cautious."
      : label === "Reciting"
        ? "Each run this long occurs about once in the book, so the model has one continuation to offer and reproduces the text. Fluent, and entirely unoriginal."
        : label === "Composing"
          ? "Long enough to spell and to string phrases together, short enough that every context has been seen many times, so there is always a genuine choice to make."
          : "Too little context to know which word it is in the middle of. It has learned which letters keep company, and no more.";

  sweep = [];
  const contexts = [...SWEEP_CONTEXTS];
  const slice = (): void => {
    if (job !== sweepJob) return;
    const next = contexts.shift();
    if (next === undefined) {
      drawSweep();
      drawLedger();
      status.textContent = `Current · ${SUMMARY_LENGTH} characters scored at ${params.context} of context · temperature ${params.temperature.toFixed(1)} · top-k ${params.topK >= 33 ? "off" : params.topK} · ${text.length.toLocaleString("en-GB")} characters of source text`;
      return;
    }
    sweep.push(write(next, SWEEP_LENGTH, SUMMARY_SEED));
    window.setTimeout(slice, 0);
  };
  window.setTimeout(slice, 0);
}

let debounce = 0;
const panel = renderControls(byId("lm-controls"), "lm", controls, params, (key) => {
  if (key === "speed") return;
  transport.pause();
  if (key === "prompt") restartLive();
  drawLive();
  if (key === "context" && sweep.length === SWEEP_CONTEXTS.length) {
    drawSweep();
    drawLedger();
  }
  window.clearTimeout(debounce);
  byId("lm-simulation-status").textContent = "Calculating…";
  debounce = window.setTimeout(summarise, 180);
});

playButton.addEventListener("click", () => {
  if (!transport.running && written.length >= LIVE_LIMIT) restartLive();
  transport.toggle();
});
byId("lm-step").addEventListener("click", () => transport.stepOnce());
byId("lm-restart").addEventListener("click", () => {
  transport.pause();
  liveSeed = nextSeed(liveSeed);
  restartLive();
  drawLive();
});
byId("lm-reset").addEventListener("click", () => {
  transport.pause();
  Object.assign(params, defaults);
  panel.sync();
  liveSeed = 11;
  restartLive();
  drawLive();
  summarise();
});

mountCodePeek(byId("code-peek"), {
  summary: "a whole language model, and its sampler",
  source,
  marker: "predict",
  python: `import numpy as np
from collections import Counter

def predict_next(book, history, n):
    context = history[-n:] if n else ""
    while True:                               # back off until the run has been seen
        follows = Counter(book[i + len(context)]
                          for i in range(len(book) - len(context))
                          if book.startswith(context, i))
        if follows or not context:
            return follows
        context = context[1:]

def sample(follows, temperature=1.0, top_k=33):
    tokens, counts = zip(*follows.most_common(top_k))
    odds = np.array(counts, float) ** (1 / temperature)
    return np.random.choice(tokens, p=odds / odds.sum())

text = "alice "
for _ in range(300):
    text += sample(predict_next(book, text, n=5))`,
});

restartLive();
drawLive();
drawSweep();
summarise();
redrawOnResize([sweepChart], drawSweep);
initLabPage();
