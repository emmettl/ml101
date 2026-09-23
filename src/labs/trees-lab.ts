import { makeDataset, splitDataset, type DatasetKind, type LabelledPoint } from "../network/engine";
import { drawDecision } from "../network/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { seededRandom } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import {
  FEATURE_NAMES,
  ensembleAccuracy,
  ensembleProbability,
  fitBoosting,
  fitForest,
  fitTree,
  leafCount,
  questionCount,
  type Ensemble,
  type Method,
  type Tree,
} from "../trees/engine";
import source from "../trees/engine.ts?raw";

const SEED = 20260920;
const POINTS = 400;
const MAX_DEPTH = 12;
const RATE = 0.3;

interface Params extends Record<string, number | string> {
  pattern: string;
  method: string;
  depth: number;
  count: number;
  noise: number;
}

const defaults: Params = { pattern: "circle", method: "tree", depth: 4, count: 50, noise: 0.1 };
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const NAMES: Record<string, string> = {
  blobs: "two clusters",
  xor: "opposite corners",
  circle: "the ring",
  spiral: "the spiral",
};

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "pattern",
    label: "Pattern",
    options: [
      { value: "blobs", label: "Two clusters" },
      { value: "xor", label: "Opposite corners (XOR)" },
      { value: "circle", label: "Ring around a centre" },
      { value: "spiral", label: "Two spiral arms" },
    ],
  },
  {
    type: "select",
    key: "method",
    label: "Machine",
    options: [
      { value: "tree", label: "One tree" },
      { value: "forest", label: "A forest: many trees on reshuffled data, averaged" },
      { value: "boosting", label: "Boosting: trees grown in turn, each fixing the last" },
    ],
  },
  {
    type: "range",
    key: "depth",
    label: "Depth: questions on the way to an answer",
    min: 1,
    max: MAX_DEPTH,
    step: 1,
    format: (value) => String(value),
    help: "A depth-1 tree asks one question. In a forest or boosting, every tree is this deep.",
  },
  {
    type: "range",
    key: "count",
    label: "Trees (forest and boosting only)",
    min: 1,
    max: 200,
    step: 1,
    format: (value) => String(value),
  },
  {
    type: "range",
    key: "noise",
    label: "Mislabelled examples",
    min: 0,
    max: 0.3,
    step: 0.05,
    format: percent,
    help: "A share of the training labels are flipped at random, as real data always has some.",
  },
];

const mapChart = byId<SVGSVGElement>("tree-map");
const heat = createHeatLayer(byId("tree-map-host"));
const curveChart = byId<SVGSVGElement>("tree-curve");
let training: LabelledPoint[] = [];
let heldOut: LabelledPoint[] = [];
let model: Ensemble;
let frame = 0;

function data(): void {
  const random = seededRandom(SEED + 1);
  const all = makeDataset(params.pattern as DatasetKind, SEED, POINTS, 0.15).map((point) =>
    random() < params.noise ? { ...point, label: 1 - point.label } : point,
  );
  ({ train: training, heldOut } = splitDataset(all));
}

function fit(method: Method, depth: number, count: number): Ensemble {
  if (method === "forest") return fitForest(training, depth, count);
  if (method === "boosting") return fitBoosting(training, depth, count, RATE);
  return fitTree(training, depth);
}

function drawMap(): void {
  drawDecision(mapChart, heat, (x, y) => ensembleProbability(model, x, y), training, {
    base: { width: 760, height: 460 },
    heldOut,
    markWrong: true,
    grid: 96,
  });
}

function drawCurve(): void {
  const single = params.method === "tree";
  const xs = single
    ? Array.from({ length: MAX_DEPTH }, (_, at) => at + 1)
    : Array.from({ length: params.count }, (_, at) => at + 1);
  const scores = single
    ? xs.map((depth) => {
        const tree = fit("tree", depth, 1);
        return [ensembleAccuracy(tree, training), ensembleAccuracy(tree, heldOut)] as const;
      })
    : xs.map(
        (upTo) =>
          [
            ensembleAccuracy(model, training, upTo),
            ensembleAccuracy(model, heldOut, upTo),
          ] as const,
      );
  const plot = createPlot(curveChart, {
    base: { width: 900, height: 280 },
    xRange: [1, Math.max(2, xs.length)],
    yRange: [40, 100],
    xLabel: single ? "Depth of the tree" : "Trees used, in the order they were grown",
    yLabel: "Right",
    yTicks: [40, 60, 80, 100],
    yFormat: (value) => `${value}%`,
    xFormat: (value) => String(Math.round(value)),
  });
  // For a single tree the guide marks the chosen depth; an ensemble's guide would sit on the
  // right edge with its label clipped, so it goes without one.
  if (single) plot.guide("x", params.depth, `depth ${params.depth}`, "calm");
  plot.line(
    xs.map((x, at) => [x, scores[at][0] * 100] as const),
    "train",
  );
  plot.line(
    xs.map((x, at) => [x, scores[at][1] * 100] as const),
    "held",
  );
}

/** A tree as nested questions, to a depth people can read. */
function renderTree(host: HTMLElement, tree: Tree, shown = 3): void {
  const build = (node: Tree, depth: number): HTMLElement => {
    if (node.leaf) {
      const leaf = document.createElement("li");
      leaf.className = "leaf";
      leaf.textContent = `→ ${node.value >= 0.5 ? "class B" : "class A"} (${percent(node.value)} B among ${node.count} examples)`;
      return leaf;
    }
    if (depth >= shown) {
      const more = document.createElement("li");
      more.className = "leaf";
      more.textContent = `… ${leafCount(node) - 1} more questions below`;
      return more;
    }
    const item = document.createElement("li");
    const question = document.createElement("span");
    question.className = "question";
    question.textContent = `Is ${FEATURE_NAMES[node.feature]} below ${node.split.toFixed(2)}?`;
    const branches = document.createElement("ul");
    const yes = document.createElement("li");
    yes.append("Yes: ");
    const yesList = document.createElement("ul");
    yesList.append(build(node.left, depth + 1));
    yes.append(yesList);
    const no = document.createElement("li");
    no.append("No: ");
    const noList = document.createElement("ul");
    noList.append(build(node.right, depth + 1));
    no.append(noList);
    branches.append(yes, no);
    item.append(question, branches);
    return item;
  };
  const root = document.createElement("ul");
  root.append(build(tree, 0));
  host.replaceChildren(root);
}

function story(seen: number, unseen: number): string {
  const name = NAMES[params.pattern];
  const gap = seen - unseen;
  const questions = questionCount(model);
  const parts: string[] = [];
  if (params.method === "tree") {
    if (params.depth === 1)
      parts.push(
        `One question, so one straight cut, always parallel to an axis: ${percent(unseen)} right on unseen examples of ${name}. ${params.pattern === "xor" ? "No single cut can do better than a coin toss here, and the tree agrees." : "Add a question and each side gets its own cut."}`,
      );
    else if (gap > 0.07)
      parts.push(
        `${questions} questions and a boundary full of small boxes: ${percent(seen)} right on the training examples, ${percent(unseen)} on unseen ones. The tree has kept asking until it could put every stray point, including the ${percent(params.noise)} that are mislabelled, in a box of its own. That is lesson 02's memorising, done with if-then instead of a wiggly curve.`,
      );
    else
      parts.push(
        `${questions} question${questions === 1 ? "" : "s"} draw ${name} out of boxes: ${percent(seen)} right on training examples, ${percent(unseen)} on unseen ones, and the two agree. Every edge of the shaded boundary is parallel to an axis, because every question is about one input at a time.`,
      );
  } else if (params.method === "forest") {
    parts.push(
      `${params.count} trees, each grown on a reshuffled copy of the data and each ${params.depth} deep, voting: ${percent(unseen)} right on unseen examples of ${name}${gap > 0.07 ? `, against ${percent(seen)} on the training ones` : ""}. Each tree memorises its own accidents; averaged, the accidents cancel and the boxes soften into something closer to the true shape. Watch the curve: most of the gain comes from the first twenty or so trees.`,
    );
  } else {
    parts.push(
      `${params.count} trees, each ${params.depth} deep, grown in turn, each fitted to what the ones before got wrong: ${percent(unseen)} right on unseen examples of ${name}. ${params.depth === 1 && params.pattern === "xor" ? "It is stuck near a coin toss, and more trees will not help: a depth-1 tree asks about one input, and a sum of one-input answers cannot express “same sign on both”. Give the trees a second question." : params.depth === 1 ? "A depth-1 tree asks a single question, and a hundred single questions added up can still draw a ring, because a ring is a matter of each input on its own." : "This is gradient descent with a tree as the step, and it can memorise like anything else: keep adding deep trees and watch the two curves part."}`,
    );
  }
  return parts.join(" ");
}

function draw(): void {
  model = fit(params.method as Method, params.depth, params.count);
  const seen = ensembleAccuracy(model, training);
  const unseen = ensembleAccuracy(model, heldOut);
  drawMap();
  drawCurve();
  renderStats(byId("tree-stats"), [
    { label: "Right on training examples", value: percent(seen) },
    {
      label: "Right on unseen examples",
      value: percent(unseen),
      tone: unseen >= 0.88 ? "good" : undefined,
    },
    {
      label: "Gap",
      value: `${Math.round((seen - unseen) * 100)} points`,
      tone: seen - unseen > 0.07 ? "bad" : "good",
    },
    { label: "Questions in the machine", value: questionCount(model).toLocaleString("en-GB") },
    { label: "Trees", value: String(model.trees.length) },
  ]);
  renderTree(byId("tree-questions"), model.trees[0]);
  byId("tree-questions-caption").textContent =
    params.method === "tree"
      ? "The whole tree, to three questions deep"
      : `The first of the ${model.trees.length} trees, to three questions deep`;
  byId("tree-outcome").textContent = story(seen, unseen);
  byId("tree-name").textContent =
    params.method === "tree"
      ? `one tree, ${params.depth} deep, on ${NAMES[params.pattern]}`
      : `${params.method === "forest" ? "a forest of" : "boosting with"} ${params.count} trees, ${params.depth} deep, on ${NAMES[params.pattern]}`;
  byId("tree-description").textContent =
    `${training.length} training examples with ${percent(params.noise)} of their labels flipped, ${heldOut.length} unseen. ${percent(seen)} right on training examples, ${percent(unseen)} on unseen ones, using ${questionCount(model).toLocaleString("en-GB")} if-then questions in all.`;
  byId("tree-simulation-status").textContent =
    `Current · ${NAMES[params.pattern]} · ${params.method === "tree" ? "one tree" : `${params.method} of ${params.count}`} · depth ${params.depth} · ${percent(params.noise)} mislabelled`;
}

function schedule(): void {
  byId("tree-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

const panel = renderControls(byId("tree-controls"), "tree", controls, params, (key) => {
  if (key === "pattern" || key === "noise") data();
  schedule();
});

byId("tree-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  data();
  schedule();
});

mountCodePeek(byId("code-peek"), {
  summary: "growing one tree: try every split, keep the purest, recurse",
  source,
  marker: "tree",
  pythonCaption: "The same three machines in scikit-learn",
  python: `from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier

tree = DecisionTreeClassifier(max_depth=4).fit(X_train, y_train)
forest = RandomForestClassifier(n_estimators=50, max_depth=12).fit(X_train, y_train)
boosted = GradientBoostingClassifier(n_estimators=100, max_depth=2, learning_rate=0.3).fit(X_train, y_train)

for model in (tree, forest, boosted):
    print(type(model).__name__, model.score(X_train, y_train), model.score(X_held, y_held))

# The questions, in words. Only a single tree can be read this way.
from sklearn.tree import export_text
print(export_text(tree, feature_names=["input 1", "input 2"]))`,
});

data();
draw();
redrawOnResize([mapChart, curveChart], () => {
  drawMap();
  drawCurve();
});
window.addEventListener(THEME_EVENT, drawMap);
initLabPage();
