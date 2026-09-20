import corpus from "../data/alice.txt?raw";
import { WORD_START, learnMerges, tokenise, vocabularySize } from "../language/bpe";
import source from "../language/embeddings.ts?raw";
import { drawFamilyMap, drawMeaningMap, renderTokens } from "../language/embed-view";
import {
  ANALOGIES,
  analogiesSolved,
  clusterPurity,
  createEmbeddings,
  embeddingStep,
  makeCorpus,
  solveAnalogy,
  trainEmbeddings,
  type Embeddings,
} from "../language/embeddings";
import { normalise } from "../language/ngram";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { redrawOnResize } from "../shared/plot";
import { nextSeed, seededRandom, type Random } from "../shared/random";
import { createTransport } from "../shared/transport";

const MAX_MERGES = 400;
const INSTANT_STEPS = 20_000;
const LIVE_LIMIT = 30_000;
const bookText = normalise(corpus);
const merges = learnMerges(bookText, MAX_MERGES);
const sentences = makeCorpus(20260920);

interface Params extends Record<string, number | string> {
  merges: number;
  dimensions: number;
  analogy: number;
  speed: number;
}

const defaults: Params = { merges: 400, dimensions: 8, analogy: 0, speed: 1500 };
const params: Params = { ...defaults };

const question = (index: number): string => {
  const { a, b, c } = ANALOGIES[index];
  return `${a} − ${b} + ${c}`;
};

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "merges",
    label: "Tokeniser: merges learned",
    min: 0,
    max: MAX_MERGES,
    step: 1,
    format: (value) => `${value} · ${vocabularySize(bookText, value)} tokens`,
    help: "Zero means one token per character. Each merge adds one entry to the vocabulary.",
  },
  {
    type: "select",
    key: "dimensions",
    label: "Embedding: dimensions",
    options: [
      { value: "2", label: "2: fits on a page" },
      { value: "4", label: "4" },
      { value: "8", label: "8: room for several kinds of meaning" },
    ],
    help: "How many coordinates each word gets. Applies to the arithmetic, not the live map.",
  },
  {
    type: "select",
    key: "analogy",
    label: "Question to draw",
    options: ANALOGIES.map((_, index) => ({
      value: String(index),
      label: `${question(index)} = ?`,
    })),
  },
  {
    type: "select",
    key: "speed",
    label: "Live training speed",
    options: [
      { value: "300", label: "Slow: 300 steps a second" },
      { value: "1500", label: "Normal: 1,500 steps a second" },
      { value: "6000", label: "Fast: 6,000 steps a second" },
    ],
  },
];

const familyChart = byId<SVGSVGElement>("embed-family-chart");
const meaningChart = byId<SVGSVGElement>("embed-meaning-chart");
const textEntry = byId<HTMLInputElement>("embed-text");
const playButton = byId<HTMLButtonElement>("embed-play");

const LIVE_SEED = 9;
let liveSeed = LIVE_SEED;
let live: Embeddings = createEmbeddings(sentences, 2, liveSeed);
let liveRandom: Random = seededRandom(liveSeed + 100);
let instant: Embeddings = createEmbeddings(sentences, 8, 3);

function drawTokens(): void {
  const text = textEntry.value.trim();
  const tokens = tokenise(text, merges, params.merges);
  renderTokens(byId("embed-chips"), tokens);
  const words = text.split(/\s+/).filter(Boolean);
  const characters = text.replace(/\s+/g, "").length;
  const shredded = words
    .map((word) => ({ word, pieces: tokenise(word, merges, params.merges).length }))
    .sort((a, b) => b.pieces - a.pieces)[0];
  const outcome = byId("embed-token-outcome");
  if (!tokens.length) {
    outcome.textContent = "Type something above to see how it is cut up.";
    return;
  }
  const whole = tokens.filter((token) => token.startsWith(WORD_START)).length;
  const worst =
    shredded && shredded.pieces > 2
      ? ` “${shredded.word}” costs ${shredded.pieces} tokens: the tokeniser has no entry for it, so it is spelled from fragments, and fragments are all the model will see.`
      : " Every word here was common enough in the book to earn an entry of its own, or nearly.";
  outcome.textContent =
    params.merges === 0
      ? `With no merges the model receives ${tokens.length} separate characters for ${words.length} words. Slide the merges up and watch the common words fuse first.`
      : `${words.length} words become ${tokens.length} tokens (${(characters / tokens.length).toFixed(1)} characters each), of which ${whole} start a word.${worst}`;
}

function stepLive(): boolean {
  const progress = live.steps / LIVE_LIMIT;
  embeddingStep(live, liveRandom, 0.08 * (1 - 0.9 * progress));
  return live.steps < LIVE_LIMIT;
}

const transport = createTransport({
  step: stepLive,
  draw: drawMaps,
  rate: () => params.speed,
  limit: LIVE_LIMIT,
  onState: (running) => {
    playButton.textContent = running ? "Pause" : "Play";
  },
});

function drawMaps(): void {
  drawFamilyMap(familyChart, live);
  drawMeaningMap(meaningChart, instant, ANALOGIES[params.analogy]);
  byId("embed-meaning-caption").textContent =
    `The people in ${params.dimensions} dimensions, seen along two directions found in the vectors`;
  const purity = clusterPurity(live);
  const left =
    live.steps === 0
      ? "Left: step 0. Positions are random, so royalty, animals and food are scattered through each other."
      : `Left: after ${live.steps.toLocaleString("en-GB")} steps, ${(purity * 100).toFixed(0)}% of the words have a member of their own family as nearest neighbour. ${purity >= 0.9 ? "Animals, food and people have pulled apart, from nothing but which words share sentences." : "Families are forming, but with only two coordinates they keep getting in each other's way. Some random starts untangle and some never do: try New start."}`;
  const solved = solveAnalogy(instant, ANALOGIES[params.analogy]);
  const right = ` Right: ${question(params.analogy)} lands nearest “${solved.ranked[0].word}”${solved.correct ? ", as hoped" : `, not “${ANALOGIES[params.analogy].expected}”`}. The dashed arrow is the step being borrowed; the solid arrow applies it.`;
  byId("embed-outcome").textContent = left + right;
}

function summarise(): void {
  instant = createEmbeddings(sentences, params.dimensions, 3);
  trainEmbeddings(instant, INSTANT_STEPS, 103);
  const solvedCount = analogiesSolved(instant);
  const chosen = solveAnalogy(instant, ANALOGIES[params.analogy]);
  renderStats(byId("embed-stats"), [
    {
      label: "Analogies solved",
      value: `${solvedCount} of ${ANALOGIES.length}`,
      tone: solvedCount === ANALOGIES.length ? "good" : solvedCount < 4 ? "bad" : undefined,
    },
    {
      label: "This one lands on",
      value: chosen.ranked[0].word,
      tone: chosen.correct ? "good" : "bad",
    },
    { label: "Similarity", value: chosen.ranked[0].similarity.toFixed(2) },
    { label: "Families kept apart", value: `${(clusterPurity(instant) * 100).toFixed(0)}%` },
  ]);
  byId("embed-name").textContent =
    `${params.dimensions} dimension${params.dimensions === 1 ? "" : "s"}`;
  byId("embed-description").textContent =
    solvedCount === ANALOGIES.length
      ? `Each word is ${params.dimensions} numbers. That is enough room for rank, gender and age to lie along separate directions, so a step learned between one pair of words transfers cleanly to another.`
      : `Each word is only ${params.dimensions} numbers. Rank, gender, age and the animal and food families all have to share them, so the directions interfere and a step learned between one pair of words lands in the wrong place for another.`;
  byId("embed-simulation-status").textContent =
    `Current · ${params.dimensions}-dimensional vectors for ${instant.words.length} words · ${INSTANT_STEPS.toLocaleString("en-GB")} training steps on ${sentences.length} sentences · fixed random start`;

  byId("embed-ledger").replaceChildren(
    ...ANALOGIES.map((analogy, index) => {
      const result = solveAnalogy(instant, analogy);
      const tr = document.createElement("tr");
      if (index === params.analogy) tr.classList.add("selected-observation");
      [
        `${question(index)}`,
        analogy.expected,
        result.ranked[0].word,
        result.ranked[0].similarity.toFixed(2),
        `${result.ranked[1].word} (${result.ranked[1].similarity.toFixed(2)})`,
        result.correct ? "Right" : "Wrong",
      ].forEach((value, column) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (column === 5) cell.className = result.correct ? "event-positive" : "event-negative";
        tr.append(cell);
      });
      return tr;
    }),
  );
}

const panel = renderControls(byId("embed-controls"), "embed", controls, params, (key) => {
  if (key === "merges") drawTokens();
  if (key === "dimensions" || key === "analogy") {
    summarise();
    drawMaps();
  }
});

function restartLive(): void {
  transport.pause();
  live = createEmbeddings(sentences, 2, liveSeed);
  liveRandom = seededRandom(liveSeed + 100);
  drawMaps();
}

textEntry.addEventListener("input", drawTokens);
playButton.addEventListener("click", () => {
  if (!transport.running && live.steps >= LIVE_LIMIT) restartLive();
  transport.toggle();
});
byId("embed-restart").addEventListener("click", () => {
  liveSeed = nextSeed(liveSeed);
  restartLive();
});
byId("embed-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  liveSeed = LIVE_SEED;
  drawTokens();
  summarise();
  restartLive();
});

mountCodePeek(byId("code-peek"), {
  summary: "one training step for word vectors",
  source,
  marker: "embed",
  python: `import numpy as np

def step(vectors, neighbours, word, real_neighbour, rate, negatives=4):
    others = [real_neighbour] + list(np.random.randint(len(vectors), size=negatives))
    answers = [1] + [0] * negatives            # real pair: 1, random pairs: 0
    change = np.zeros_like(vectors[word])
    for other, answer in zip(others, answers):
        score = vectors[word] @ neighbours[other]       # same direction -> big
        blame = 1 / (1 + np.exp(-score)) - answer      # guess minus answer
        change += blame * neighbours[other]
        neighbours[other] -= rate * blame * vectors[word]
    vectors[word] -= rate * change

# afterwards, meaning is arithmetic:
target = vectors["king"] - vectors["man"] + vectors["woman"]   # lands by "queen"`,
});

drawTokens();
summarise();
drawMaps();
redrawOnResize([familyChart, meaningChart], drawMaps);
initLabPage();
