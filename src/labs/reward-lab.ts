import {
  CLIFF_REWARD,
  COLUMNS,
  GOAL_REWARD,
  ROWS,
  train,
  type Outcome,
  type Settings,
} from "../reward/engine";
import source from "../reward/engine.ts?raw";
import { drawGrid } from "../reward/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { THEME_EVENT } from "../shared/theme";

const DISCOUNT = 0.95;
const BEST_ROUTE = GOAL_REWARD - (COLUMNS + 1) + 1;

interface Params extends Record<string, number | string> {
  algorithm: string;
  exploration: number;
  learningRate: number;
  episodes: number;
  run: number;
}

const defaults: Params = {
  algorithm: "q-learning",
  exploration: 0.1,
  learningRate: 0.5,
  episodes: 1000,
  run: 1,
};
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "algorithm",
    label: "How guesses are updated",
    options: [
      { value: "q-learning", label: "Q-learning: assume the next move will be the best one" },
      { value: "sarsa", label: "SARSA: use the move it will actually make, slips and all" },
    ],
  },
  {
    type: "range",
    key: "exploration",
    label: "Exploration: share of moves made at random",
    min: 0,
    max: 0.3,
    step: 0.02,
    format: percent,
  },
  {
    type: "range",
    key: "learningRate",
    label: "Learning rate: how far a guess moves each time",
    min: 0.05,
    max: 1,
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
  {
    type: "range",
    key: "episodes",
    label: "Episodes: trips from the start",
    min: 50,
    max: 2000,
    step: 50,
    format: (value) => value.toLocaleString("en-GB"),
  },
  {
    type: "range",
    key: "run",
    label: "Which run",
    min: 1,
    max: 5,
    step: 1,
    format: (value) => `run ${value}`,
    help: "The same settings with different random moves. Compare runs before trusting a number.",
  },
];

const gridChart = byId<SVGSVGElement>("rl-grid");
const rewardChart = byId<SVGSVGElement>("rl-rewards");
let outcome: Outcome;
let frame = 0;

const settings = (): Settings => ({
  algorithm: params.algorithm as Settings["algorithm"],
  exploration: params.exploration,
  learningRate: params.learningRate,
  discount: DISCOUNT,
});

const average = (values: readonly number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function smoothed(values: readonly number[], window: number): number[] {
  return values.map((_, at) => average(values.slice(Math.max(0, at - window + 1), at + 1)));
}

function drawRewards(): void {
  const curve = smoothed(outcome.returns, 25);
  const plot = createPlot(rewardChart, {
    base: { width: 900, height: 260 },
    xRange: [1, Math.max(2, outcome.returns.length)],
    yRange: [Math.max(-150, Math.min(...curve) - 5), GOAL_REWARD],
    xLabel: "Episode",
    yLabel: "Reward per episode",
    xFormat: (value) => String(Math.round(value)),
  });
  plot.guide("y", BEST_ROUTE, `edge route: ${BEST_ROUTE}`, "calm");
  plot.guide("y", CLIFF_REWARD, "one fall", "warn", "plot-label warn");
  plot.line(
    curve.map((value, at) => [at + 1, value] as const),
    "train",
  );
}

function lateFalls(): number {
  const tail = outcome.falls.slice(-100);
  return (tail.reduce((sum, value) => sum + value, 0) * 100) / Math.max(1, tail.length);
}

function closestRow(): number {
  // Every route must leave the start and reach the goal through the squares beside them, so the
  // clearance that tells routes apart is measured across the columns in between.
  const rows = outcome.route
    .filter((square) => square % COLUMNS > 0 && square % COLUMNS < COLUMNS - 1)
    .map((square) => Math.floor(square / COLUMNS));
  return rows.length ? ROWS - 1 - Math.max(...rows) : ROWS;
}

function story(): string {
  const falls = lateFalls();
  const late = average(outcome.returns.slice(-100));
  const rows = closestRow();
  const parts: string[] = [];
  if (outcome.routeEnds === "loop")
    parts.push(
      `Following its best guesses from the start, the agent never reaches the goal: it circles. ${params.episodes < 300 ? "It has not had enough trips to work the route out." : "Some squares' guesses were never corrected, because exploration rarely took it there."}`,
    );
  else if (outcome.routeEnds === "cliff")
    parts.push(
      "Following its best guesses from the start, the agent walks off the cliff. A guess along the way is wrong and has not been visited enough to be corrected.",
    );
  else if (rows === 1)
    parts.push(
      `Following its best guesses, the agent takes the edge route: ${outcome.route.length - 1} moves for a reward of ${outcome.routeReward}, one square from the cliff the whole way. It is the best route there is, if you never slip.`,
    );
  else
    parts.push(
      `Following its best guesses, the agent takes a route ${rows} squares clear of the cliff: ${outcome.route.length - 1} moves for a reward of ${outcome.routeReward}, against ${BEST_ROUTE} for the edge route. It is a worse route on paper and a better one for an agent that sometimes moves at random.`,
    );
  if (params.exploration === 0)
    parts.push(
      "With no exploration it follows its guesses from the first trip. Here that worked, because every fall was a lesson; on most problems it means never finding the good moves at all.",
    );
  else
    parts.push(
      `While learning, with ${percent(params.exploration)} of moves random, it earned ${late.toFixed(0)} per trip over the last hundred and fell ${falls.toFixed(0)} times per hundred trips.${params.algorithm === "q-learning" && rows === 1 && falls > 5 ? " Q-learning's guesses assume every future move will be the best one, so they praise the edge route and ignore that a random move there is fatal. It is learning about an agent it is not." : params.algorithm === "sarsa" ? " SARSA's guesses include its own random moves, so a square next to the cliff looks as dangerous as it is, and the route moves away." : ""}`,
    );
  return parts.join(" ");
}

function draw(): void {
  outcome = train(settings(), params.episodes, params.run);
  drawGrid(gridChart, outcome.table, outcome.route);
  drawRewards();
  const falls = lateFalls();
  const late = average(outcome.returns.slice(-100));
  renderStats(byId("rl-stats"), [
    {
      label: "Route reward, following its best guesses",
      value:
        outcome.routeEnds === "goal"
          ? String(outcome.routeReward)
          : outcome.routeEnds === "cliff"
            ? "falls"
            : "never arrives",
      tone: outcome.routeReward === BEST_ROUTE ? "good" : undefined,
    },
    {
      label: "Moves on that route",
      value: outcome.routeEnds === "goal" ? String(outcome.route.length - 1) : "–",
    },
    {
      label: "Closest it comes to the cliff",
      value:
        outcome.routeEnds === "goal"
          ? `${closestRow()} square${closestRow() === 1 ? "" : "s"}`
          : "–",
    },
    {
      label: "Reward per trip, last 100 while learning",
      value: late.toFixed(0),
      tone: late > 5 ? "good" : late < -20 ? "bad" : undefined,
    },
    {
      label: "Falls per 100 trips, while learning",
      value: falls.toFixed(0),
      tone: falls > 30 ? "bad" : falls < 5 ? "good" : undefined,
    },
  ]);
  byId("rl-ledger").replaceChildren(
    ...Array.from({ length: Math.min(10, Math.ceil(params.episodes / 100)) }, (_, block) => {
      const from =
        block * Math.ceil(params.episodes / Math.min(10, Math.ceil(params.episodes / 100)));
      const to = Math.min(
        params.episodes,
        from + Math.ceil(params.episodes / Math.min(10, Math.ceil(params.episodes / 100))),
      );
      const row = document.createElement("tr");
      const cells = [
        `${from + 1}–${to}`,
        average(outcome.returns.slice(from, to)).toFixed(0),
        String(outcome.falls.slice(from, to).reduce((sum, value) => sum + value, 0)),
        String(Math.min(...outcome.returns.slice(from, to))),
        String(Math.max(...outcome.returns.slice(from, to))),
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
  byId("rl-outcome").textContent = story();
  byId("rl-name").textContent =
    `${params.algorithm === "sarsa" ? "SARSA" : "Q-learning"}, ${percent(params.exploration)} exploration, ${params.episodes.toLocaleString("en-GB")} trips`;
  byId("rl-description").textContent =
    `${params.episodes.toLocaleString("en-GB")} trips from the start, each move ${percent(params.exploration)} likely to be random, guesses moved ${params.learningRate.toFixed(2)} of the way each time. Following its best guesses afterwards, the agent ${outcome.routeEnds === "goal" ? `reaches the goal in ${outcome.route.length - 1} moves for ${outcome.routeReward}` : outcome.routeEnds === "cliff" ? "walks off the cliff" : "never reaches the goal"}; while learning, over the last hundred trips, it earned ${average(outcome.returns.slice(-100)).toFixed(0)} a trip and fell ${lateFalls().toFixed(0)} times per hundred.`;
  byId("rl-simulation-status").textContent =
    `Current · ${params.algorithm} · exploration ${percent(params.exploration)} · rate ${params.learningRate.toFixed(2)} · ${params.episodes} episodes · run ${params.run}`;
}

function schedule(): void {
  byId("rl-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

const panel = renderControls(byId("rl-controls"), "rl", controls, params, schedule);

byId("rl-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  schedule();
});

mountCodePeek(byId("code-peek"), {
  summary: "one episode: choose, move, see the reward, nudge the guess",
  source,
  marker: "learn",
  pythonCaption: "The update, as it is usually written",
  python: `# Q is a table: Q[square][move] = guess at the reward still to come.
for episode in range(episodes):
    square = START
    while square != GOAL:
        move = random_move() if random() < exploration else argmax(Q[square])
        next_square, reward = step(square, move)
        # Q-learning: the target assumes the best next move. (SARSA would use the move actually taken.)
        target = reward + discount * max(Q[next_square])
        Q[square][move] += learning_rate * (target - Q[square][move])
        square = next_square`,
});

draw();
redrawOnResize([rewardChart], drawRewards);
window.addEventListener(THEME_EVENT, () => drawGrid(gridChart, outcome.table, outcome.route));
initLabPage();
