import corpus from "../data/alice.txt?raw";
import {
  buildCounts,
  contextSeen,
  countOdds,
  countSurprise,
  tableEntries,
  type CountModel,
} from "../language/counts";
import {
  EMBEDDING_SIZE,
  HELD_OUT_SHARE,
  HIDDEN_UNITS,
  alphabetOf,
  createNeuralModel,
  encode,
  knobCount,
  nearestCharacters,
  neuralOdds,
  type NeuralModel,
  type TrainProgress,
  type TrainRequest,
} from "../language/neural";
import source from "../language/neural.ts?raw";
import { copiedShare, normalise, type NextChoice } from "../language/ngram";
import { renderOdds } from "../language/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { nextSeed, seededRandom } from "../shared/random";

const text = normalise(corpus);
const alphabet = alphabetOf(text);
const ids = encode(text, alphabet);
const split = Math.floor(ids.length * (1 - HELD_OUT_SHARE));
const GUESSING = Math.log(alphabet.symbols.length);
const SAMPLE_LENGTH = 600;

interface Params extends Record<string, number | string> {
  context: number;
  prompt: string;
  budget: number;
}

const defaults: Params = { context: 6, prompt: "said the ", budget: 400_000 };
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "context",
    label: "Characters of context",
    min: 2,
    max: 8,
    step: 1,
    format: (value) => String(value),
    help: "Both machines see the same number of characters. Changing it resets the network.",
  },
  {
    type: "select",
    key: "prompt",
    label: "Text to continue",
    options: [
      { value: "said the ", label: "said the … (very common)" },
      { value: "the white rabb", label: "the white rabb… (one possible answer)" },
      { value: "alice looked at the jabberw", label: "…the jabberw (never in the book)" },
      { value: "she thought of the xylo", label: "…the xylo (never in the book)" },
    ],
  },
  {
    type: "select",
    key: "budget",
    label: "How much the network reads",
    options: [
      { value: "200000", label: "200,000 characters: a quick look" },
      { value: "400000", label: "400,000 characters: about five passes" },
      { value: "1000000", label: "1,000,000 characters: about fourteen passes" },
    ],
    help: "Characters are drawn at random from the 73,000 it may study, so it sees each many times.",
  },
];

const chart = byId<SVGSVGElement>("duel-chart");
const trainButton = byId<HTMLButtonElement>("duel-train");

let table: CountModel = buildCounts(ids, split, params.context, alphabet.symbols.length);
let tableScores = { studied: 0, unseen: 0, copied: 0, sample: "" };
let seed = 5;
let network: NeuralModel = freshNetwork();
let history: { seen: number; studied: number; unseen: number }[] = [];
let training = false;
let finished = false;
let job = 0;
let worker: Worker | undefined;

function freshNetwork(): NeuralModel {
  return createNeuralModel(
    alphabet.symbols.length,
    params.context,
    EMBEDDING_SIZE,
    HIDDEN_UNITS,
    seed,
  );
}

const idsOf = (value: string): number[] => Array.from(encode(value, alphabet));
const show = (symbol: string): string => (symbol === " " ? "a space" : `“${symbol}”`);

function toChoices(odds: readonly number[]): NextChoice[] {
  return odds
    .map((probability, id) => ({ token: alphabet.symbols[id], count: 0, probability }))
    .sort((a, b) => b.probability - a.probability);
}

function write(odds: (past: number[]) => number[]): string {
  const random = seededRandom(4);
  const past = idsOf("alice was ");
  const start = past.length;
  for (let index = 0; index < SAMPLE_LENGTH; index += 1) {
    const next = odds(past);
    let remaining = random();
    let pick = next.length - 1;
    for (let id = 0; id < next.length; id += 1) {
      remaining -= next[id];
      if (remaining <= 0) {
        pick = id;
        break;
      }
    }
    past.push(pick);
  }
  return past
    .slice(start)
    .map((id) => alphabet.symbols[id])
    .join("");
}

function rebuildTable(): void {
  table = buildCounts(ids, split, params.context, alphabet.symbols.length);
  const sample = write((past) => countOdds(table, past));
  tableScores = {
    studied: countSurprise(table, ids, 1000, 5000).surprise,
    unseen: countSurprise(table, ids, split, ids.length).surprise,
    copied: copiedShare(text, sample),
    sample,
  };
}

function drawOdds(): void {
  const past = idsOf(params.prompt);
  const tableOdds = toChoices(countOdds(table, past));
  const networkOdds = toChoices(neuralOdds(network, past));
  const prompt = byId("duel-text");
  const shown = document.createElement("span");
  shown.className = "prompt";
  shown.textContent = params.prompt.slice(0, -params.context);
  const seenPart = document.createElement("span");
  seenPart.textContent = params.prompt.slice(-params.context);
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  prompt.replaceChildren(shown, seenPart, cursor);

  renderOdds(byId("duel-table-odds"), tableOdds, tableOdds, 6);
  renderOdds(byId("duel-network-odds"), networkOdds, networkOdds, 6);
  const known = contextSeen(table, past, past.length);
  byId("duel-table-caption").textContent = known
    ? `The table: it has seen these ${params.context} characters before`
    : "The table: never seen these characters, so it falls back on fewer";
  byId("duel-network-caption").textContent =
    network.steps === 0
      ? "The network: untrained, so these odds are noise"
      : `The network, after reading ${network.steps.toLocaleString("en-GB")} characters`;

  const agree = tableOdds[0].token === networkOdds[0].token;
  const tableTop = `${show(tableOdds[0].token)} at ${(tableOdds[0].probability * 100).toFixed(0)}%`;
  const networkTop = `${show(networkOdds[0].token)} at ${(networkOdds[0].probability * 100).toFixed(0)}%`;
  byId("duel-outcome").textContent =
    network.steps === 0
      ? `Both machines can see only the last ${params.context} characters, shown in dark type. The table says ${tableTop}, from counting. The network's knobs are still random, so its favourite, ${networkTop}, means nothing yet. Press Train.`
      : !known
        ? `The book never contains these ${params.context} characters in a row, so the table has nothing to look up and retreats to a shorter context: ${tableTop}. The network has no table to miss. It reads all ${params.context} characters regardless, and says ${networkTop}.`
        : agree
          ? `Both favour ${show(tableOdds[0].token)}: the table at ${(tableOdds[0].probability * 100).toFixed(0)}% from counting, the network at ${(networkOdds[0].probability * 100).toFixed(0)}% from ${knobCount(network).toLocaleString("en-GB")} knobs that have never stored a single count. Notice that the network is usually the less certain of the two. It has learned tendencies, not the text.`
          : `They disagree: the table says ${tableTop}, the network ${networkTop}. The table is reporting what this book did after exactly these characters. The network is reporting what usually follows characters like these.`;
}

function drawCurves(): void {
  const top = Math.min(4, Math.max(GUESSING, ...history.map((point) => point.unseen)) * 1.05);
  const plot = createPlot(chart, {
    base: { width: 900, height: 300 },
    xRange: [0, Math.max(params.budget, network.steps)],
    yRange: [0, top],
    xLabel: "Characters the network has read",
    yLabel: "Surprise (lower is better)",
    xFormat: (value) => (value >= 1e6 ? `${value / 1e6}m` : `${Math.round(value / 1000)}k`),
  });
  plot.guide("y", GUESSING, `blind guessing: ${GUESSING.toFixed(1)}`, "calm");
  plot.line(
    [
      [0, tableScores.unseen],
      [Math.max(params.budget, network.steps), tableScores.unseen],
    ],
    "best",
  );
  plot.line(
    [
      [0, tableScores.studied],
      [Math.max(params.budget, network.steps), tableScores.studied],
    ],
    "best",
  );
  if (history.length > 1) {
    plot.line(
      history.map((point) => [point.seen, point.studied] as const),
      "train thin",
    );
    plot.line(
      history.map((point) => [point.seen, point.unseen] as const),
      "held thin",
    );
  }
}

function drawScores(): void {
  const trained = network.steps > 0;
  const last = history.at(-1);
  const studied = last?.studied ?? GUESSING;
  const unseen = last?.unseen ?? GUESSING;
  const tableGap = tableScores.unseen - tableScores.studied;
  renderStats(byId("duel-stats"), [
    {
      label: "Table: gap, unseen minus studied",
      value: tableGap.toFixed(2),
      tone: tableGap > 0.6 ? "bad" : undefined,
    },
    { label: "Network: gap", value: trained ? (unseen - studied).toFixed(2) : "untrained" },
    { label: "Table: numbers stored", value: tableEntries(table).toLocaleString("en-GB") },
    { label: "Network: knobs", value: knobCount(network).toLocaleString("en-GB") },
  ]);
  byId("duel-name").textContent = `${params.context} characters of context`;
  byId("duel-description").textContent =
    tableGap > 0.6
      ? `At this length most runs of characters occur only once in the book, so the table has largely memorised what it read: a surprise of ${tableScores.studied.toFixed(2)} on text it studied against ${tableScores.unseen.toFixed(2)} on text it has not. Of what it writes, ${(tableScores.copied * 100).toFixed(0)}% is lifted word for word; the smoothing that lets it be scored at all also stops it reciting outright.`
      : `At this length every run of characters occurs many times, so counting works well: a surprise of ${tableScores.studied.toFixed(2)} on text it studied and ${tableScores.unseen.toFixed(2)} on text it has not. This is the table at its best.`;

  let networkSample = "";
  let networkCopied = 0;
  if (finished) {
    networkSample = write((past) => neuralOdds(network, past));
    networkCopied = copiedShare(text, networkSample);
  }
  const rows: string[][] = [
    [
      "Table of counts",
      tableEntries(table).toLocaleString("en-GB"),
      tableScores.studied.toFixed(2),
      tableScores.unseen.toFixed(2),
      tableGap.toFixed(2),
      `${(tableScores.copied * 100).toFixed(0)}%`,
      `${tableScores.sample.slice(0, 70)}…`,
    ],
    [
      "Neural network",
      knobCount(network).toLocaleString("en-GB"),
      trained ? studied.toFixed(2) : "–",
      trained ? unseen.toFixed(2) : "–",
      trained ? (unseen - studied).toFixed(2) : "–",
      finished ? `${(networkCopied * 100).toFixed(0)}%` : "–",
      finished ? `${networkSample.slice(0, 70)}…` : training ? "training…" : "press Train",
    ],
  ];
  byId("duel-ledger").replaceChildren(
    ...rows.map((cells) => {
      const tr = document.createElement("tr");
      cells.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.append(cell);
      });
      return tr;
    }),
  );

  byId("duel-neighbours").textContent = finished
    ? [".", "a", "t", " "]
        .map((symbol) => {
          const near = nearestCharacters(network, alphabet, symbol)
            .slice(0, 3)
            .map((entry) => show(entry.symbol).replace(/[“”]/g, ""));
          return `${show(symbol).replace(/[“”]/g, "")} sits nearest ${near.join(", ")}`;
        })
        .join(" · ") +
      ". Nobody told it what punctuation is, or a vowel. Characters that behave alike were pulled together because that lowered the loss, exactly as words were in lesson 05."
    : "Train the network to see which characters it comes to treat as alike.";

  const status = byId("duel-simulation-status");
  if (training) {
    status.textContent = `Training… ${network.steps.toLocaleString("en-GB")} of ${params.budget.toLocaleString("en-GB")} characters read`;
  } else {
    status.textContent = `Current · ${params.context} characters of context · table built from ${split.toLocaleString("en-GB")} characters · network ${finished ? `trained on ${network.steps.toLocaleString("en-GB")} characters drawn from the same text` : "not yet trained"} · both scored on text neither has seen`;
  }
}

function drawAll(): void {
  drawOdds();
  drawCurves();
  drawScores();
}

function receive(progress: TrainProgress): void {
  if (progress.id !== job) return;
  network = progress.model;
  network.steps = progress.seen;
  history.push({
    seen: progress.seen,
    studied: progress.trainSurprise,
    unseen: progress.heldSurprise,
  });
  if (progress.done) {
    training = false;
    finished = true;
    trainButton.textContent = "Train again";
  }
  drawAll();
}

function stopTraining(): void {
  job += 1;
  worker?.postMessage({ stop: true });
  training = false;
}

function resetNetwork(): void {
  stopTraining();
  network = freshNetwork();
  history = [];
  finished = false;
  trainButton.textContent = "Train the network";
}

function train(): void {
  resetNetwork();
  training = true;
  trainButton.textContent = "Stop";
  job += 1;
  const request: TrainRequest = {
    id: job,
    text: corpus,
    context: params.context,
    budget: params.budget,
    seed,
  };
  try {
    worker ??= new Worker(new URL("./neural-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<TrainProgress>) => receive(event.data);
    worker.postMessage(request);
  } catch {
    training = false;
    byId("duel-simulation-status").textContent =
      "Current · this browser cannot start a background worker, so the network cannot be trained here.";
    trainButton.textContent = "Train the network";
  }
  drawAll();
}

const panel = renderControls(byId("duel-controls"), "duel", controls, params, (key) => {
  if (key === "context") {
    resetNetwork();
    rebuildTable();
  }
  if (key === "budget") resetNetwork();
  drawAll();
});

trainButton.addEventListener("click", () => {
  if (training) {
    stopTraining();
    trainButton.textContent = "Train the network";
    drawAll();
  } else train();
});
byId("duel-restart").addEventListener("click", () => {
  seed = nextSeed(seed);
  resetNetwork();
  drawAll();
});
byId("duel-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  seed = 5;
  resetNetwork();
  rebuildTable();
  drawAll();
});

mountCodePeek(byId("code-peek"), {
  summary: "a complete neural language model: forward, and one step of learning",
  source,
  marker: "neural",
  pythonCaption: "The same model in PyTorch",
  python: `import torch, torch.nn as nn

class TinyLM(nn.Module):
    def __init__(self, vocab=33, context=6, size=8, hidden=64):
        super().__init__()
        self.embed = nn.Embedding(vocab, size)           # a position for each character
        self.hidden = nn.Linear(context * size, hidden)  # laid side by side, then one layer
        self.out = nn.Linear(hidden, vocab)              # a score per possible next character

    def forward(self, last_few):                         # last_few: (batch, context) ids
        x = self.embed(last_few).flatten(1)
        return self.out(torch.tanh(self.hidden(x)))

model = TinyLM()
optimiser = torch.optim.SGD(model.parameters(), lr=0.01)
for last_few, what_came_next in batches:
    loss = nn.functional.cross_entropy(model(last_few), what_came_next)  # surprise
    optimiser.zero_grad(); loss.backward(); optimiser.step()             # downhill`,
});

rebuildTable();
drawAll();
redrawOnResize([chart], drawCurves);
initLabPage();
