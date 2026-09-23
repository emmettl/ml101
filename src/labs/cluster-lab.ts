import {
  PLANE,
  elbow,
  kMeans,
  makePoints,
  purity,
  type Point,
  type Round,
  type Shape,
  type Start,
} from "../cluster/engine";
import source from "../cluster/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

const SEED = 20260920;
const MAX_K = 8;
const MAX_ROUNDS = 30;

interface Params extends Record<string, number | string> {
  shape: string;
  k: number;
  start: string;
  seed: number;
  round: number;
}

const defaults: Params = { shape: "three", k: 3, start: "random", seed: 1, round: MAX_ROUNDS };
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const NAMES: Record<string, string> = {
  three: "three round groups",
  uneven: "one big group and one small",
  rings: "two rings",
  stripes: "two diagonal stripes",
};

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "shape",
    label: "The points",
    options: [
      { value: "three", label: "Three round groups" },
      { value: "uneven", label: "One big group and one small" },
      { value: "rings", label: "Two rings, one inside the other" },
      { value: "stripes", label: "Two diagonal stripes" },
    ],
    help: "Nothing on the page tells the algorithm which points belong together. The lab knows, and uses it only to score.",
  },
  {
    type: "range",
    key: "k",
    label: "Groups to find (k)",
    min: 1,
    max: MAX_K,
    step: 1,
    format: (value) => String(value),
  },
  {
    type: "select",
    key: "start",
    label: "Starting guess",
    options: [
      { value: "random", label: "k points chosen at random" },
      { value: "spread", label: "k points chosen far apart from each other" },
    ],
  },
  {
    type: "range",
    key: "seed",
    label: "Which guess",
    min: 1,
    max: 8,
    step: 1,
    format: (value) => `guess ${value}`,
    help: "The same method, a different draw. The result can depend on it.",
  },
  {
    type: "range",
    key: "round",
    label: "Rounds played",
    min: 0,
    max: MAX_ROUNDS,
    step: 1,
    format: (value) => (value >= MAX_ROUNDS ? "until settled" : String(value)),
    help: "Slide back to watch the centres move, one round at a time.",
  },
];

const mapChart = byId<SVGSVGElement>("clu-map");
const lossChart = byId<SVGSVGElement>("clu-loss");
const elbowChart = byId<SVGSVGElement>("clu-elbow");
let points: Point[] = makePoints(params.shape as Shape, SEED);
let rounds: Round[] = [];
let curve: number[] = [];
let frame = 0;

const shown = (): number => Math.min(params.round, rounds.length - 1);

function drawMap(): void {
  const round = rounds[shown()];
  const plot = createPlot(mapChart, {
    base: { width: 760, height: 460 },
    xRange: PLANE,
    yRange: PLANE,
    xLabel: "Input 1",
    yLabel: "Input 2",
    minimumHeightShare: 0.85,
  });
  points.forEach((point, at) =>
    plot.circle(point.x, point.y, 4.2, `cluster-${round.assignment[at] % 8}`),
  );
  round.centres.forEach((centre, at) => {
    plot.circle(centre.x, centre.y, 9, `centre cluster-${at % 8}`);
    plot.text(centre.x, centre.y - 14, `centre ${at + 1}`, "plot-label strong", "middle");
  });
}

function drawLoss(): void {
  const plot = createPlot(lossChart, {
    base: { width: 900, height: 220 },
    xRange: [0, Math.max(1, rounds.length - 1)],
    yRange: [0, Math.max(...rounds.map((round) => round.loss)) * 1.08],
    xLabel: "Round",
    yLabel: "Total squared distance",
    xFormat: (value) => String(Math.round(value)),
    yFormat: (value) => value.toFixed(0),
  });
  plot.guide("x", shown(), `round ${shown()}`, "calm");
  plot.line(
    rounds.map((round, at) => [at, round.loss] as const),
    "path",
  );
  rounds.forEach((round, at) => plot.circle(at, round.loss, 3, "path"));
}

function drawElbow(): void {
  const plot = createPlot(elbowChart, {
    base: { width: 900, height: 220 },
    xRange: [1, MAX_K],
    yRange: [0, Math.max(...curve) * 1.08],
    xLabel: "Groups asked for (k)",
    yLabel: "Loss once settled",
    xTicks: Array.from({ length: MAX_K }, (_, at) => at + 1),
    xFormat: (value) => String(value),
    yFormat: (value) => value.toFixed(0),
  });
  plot.guide("x", params.k, `k = ${params.k}`, "calm");
  plot.line(
    curve.map((loss, at) => [at + 1, loss] as const),
    "train",
  );
  curve.forEach((loss, at) => plot.circle(at + 1, loss, 3.5, "train"));
}

function story(agreement: number, settled: boolean): string {
  const last = rounds[rounds.length - 1];
  const sizes = Array.from(
    { length: params.k },
    (_, at) => last.assignment.filter((cluster) => cluster === at).length,
  );
  const parts: string[] = [];
  if (!settled)
    parts.push(
      `Round ${shown()} of ${rounds.length - 1}. Each round gives every point to its nearest centre, then moves each centre to the middle of its points. The loss can only fall: watch it on the chart below, then slide on.`,
    );
  else if (params.shape === "three" && params.k === 3)
    parts.push(
      agreement > 0.95
        ? `Settled in ${rounds.length - 1} rounds, and the three centres sit where the three groups were made: ${percent(agreement)} of points are with the group they came from. Nobody told it there were three, except you, through k.`
        : `Settled in ${rounds.length - 1} rounds, but badly: two centres share one group and a third straddles two, so only ${percent(agreement)} of points are with their own. The loss is ${last.loss.toFixed(1)} against about 20 for the right answer. That is a local minimum, and the loss knows it even though no labels were used: run again from another guess and keep the lower loss.`,
    );
  else if (params.shape === "rings" && params.k === 2)
    parts.push(
      `${percent(agreement)} of points are with their own ring, which is about what a coin toss would give. Every point goes to its nearest centre, so the boundary between two clusters is always a straight line, and no straight line separates a ring from its middle. K-means finds round groups, and only round groups.`,
    );
  else if (params.shape === "stripes" && params.k === 2)
    parts.push(
      `The two centres have cut across the stripes rather than between them: ${percent(agreement)} agreement. A long thin group has its middle far from its ends, and the nearest-centre rule hands the ends to whichever centre is closest, which is often the other stripe's.`,
    );
  else if (params.shape === "uneven" && params.k === 2)
    parts.push(
      `${percent(agreement)} agreement. The small tight group is found, but the boundary has been pulled into the big group, giving some of its edge to the small centre: nearest-centre boundaries sit halfway between centres, whatever the groups' sizes. K-means expects groups of similar spread.`,
    );
  else if (params.k === 1)
    parts.push(
      "One centre, at the middle of everything, and a loss with nothing to compare against. The chart below is the only guide to how many groups there are, and it will never say one.",
    );
  else
    parts.push(
      `Settled in ${rounds.length - 1} rounds with ${params.k} centres and a loss of ${last.loss.toFixed(1)}. Cluster sizes: ${sizes.join(", ")}. ${percent(agreement)} of points are with the group they were made in${params.k > 3 ? `, though with ${params.k} clusters for fewer true groups that figure rewards splitting, not finding` : ""}.`,
    );
  if (settled && params.k > 1)
    parts.push(
      `On the elbow chart the loss falls at every k and always will, because more centres are always nearer. Where it stops falling steeply is a judgement, not a measurement.`,
    );
  return parts.join(" ");
}

function draw(): void {
  rounds = kMeans(points, params.k, params.start as Start, params.seed, MAX_ROUNDS);
  curve = elbow(points, params.start as Start, params.seed, MAX_K, 5);
  const round = rounds[shown()];
  const settled = shown() === rounds.length - 1;
  const agreement = purity(points, round.assignment, params.k);
  drawMap();
  drawLoss();
  drawElbow();
  const sizes = Array.from(
    { length: params.k },
    (_, at) => round.assignment.filter((cluster) => cluster === at).length,
  );
  renderStats(byId("clu-stats"), [
    { label: "Loss (total squared distance)", value: round.loss.toFixed(1) },
    { label: "Rounds to settle", value: String(rounds.length - 1) },
    {
      label: "Agreement with the hidden groups",
      value: percent(agreement),
      tone: agreement >= 0.95 ? "good" : agreement < 0.75 ? "bad" : undefined,
    },
    {
      label: "Largest and smallest cluster",
      value: `${Math.max(...sizes)} / ${Math.min(...sizes)}`,
    },
  ]);
  byId("clu-ledger").replaceChildren(
    ...round.centres.map((centre, at) => {
      const members = points.filter((_, index) => round.assignment[index] === at);
      const counts = new Map<number, number>();
      for (const point of members) counts.set(point.truth, (counts.get(point.truth) ?? 0) + 1);
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const row = document.createElement("tr");
      const cells = [
        `Centre ${at + 1}`,
        String(members.length),
        `${centre.x.toFixed(2)}, ${centre.y.toFixed(2)}`,
        majority ? `hidden group ${majority[0] + 1}` : "none",
        majority ? percent(majority[1] / members.length) : "0%",
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
  byId("clu-outcome").textContent = story(agreement, settled);
  byId("clu-name").textContent = `${NAMES[params.shape]}, k = ${params.k}`;
  byId("clu-description").textContent =
    `${points.length} points and no labels. ${params.k} centre${params.k === 1 ? "" : "s"}, started ${params.start === "spread" ? "far apart" : "at random"} (guess ${params.seed}), settled after ${rounds.length - 1} round${rounds.length === 2 ? "" : "s"} at a loss of ${rounds[rounds.length - 1].loss.toFixed(1)}. The lab, which invented the points, scores the result at ${percent(purity(points, rounds[rounds.length - 1].assignment, params.k))} agreement with the groups they were made in.`;
  byId("clu-simulation-status").textContent =
    `Current · ${NAMES[params.shape]} · k = ${params.k} · start ${params.start} · guess ${params.seed} · ${settled ? "settled" : `round ${shown()}`}`;
}

function schedule(): void {
  byId("clu-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

const panel = renderControls(byId("clu-controls"), "clu", controls, params, (key) => {
  if (key === "shape") points = makePoints(params.shape as Shape, SEED);
  schedule();
});

byId("clu-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  points = makePoints(params.shape as Shape, SEED);
  schedule();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole of k-means: assign to the nearest centre, move the centres, repeat",
  source,
  marker: "kmeans",
  pythonCaption: "The same in scikit-learn, with the elbow curve",
  python: `from sklearn.cluster import KMeans

model = KMeans(n_clusters=3, init="k-means++", n_init=5).fit(X)   # no y anywhere
labels, centres = model.labels_, model.cluster_centers_
print("loss:", model.inertia_)                                     # total squared distance

# The elbow: the loss for every k. It always falls; where it stops falling steeply is your call.
for k in range(1, 9):
    print(k, KMeans(n_clusters=k, n_init=5).fit(X).inertia_)`,
});

draw();
redrawOnResize([mapChart, lossChart, elbowChart], () => {
  drawMap();
  drawLoss();
  drawElbow();
});
initLabPage();
