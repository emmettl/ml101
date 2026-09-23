import { COLUMNS, GOAL_REWARD, ROWS, train, type Settings } from "../reward/engine";
import { drawGrid } from "../reward/view";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { THEME_EVENT } from "../shared/theme";

const EPISODES = 1000;
const BEST_ROUTE = GOAL_REWARD - COLUMNS;
const chart = byId<SVGSVGElement>("lesson-grid");
const algorithm = byId<HTMLSelectElement>("rl-algorithm");
const exploration = byId<HTMLInputElement>("rl-exploration");
let frame = 0;

function render(): void {
  const settings: Settings = {
    algorithm: algorithm.value as Settings["algorithm"],
    exploration: Number(exploration.value),
    learningRate: 0.5,
    discount: 0.95,
  };
  const outcome = train(settings, EPISODES, 1);
  drawGrid(chart, outcome.table, outcome.route);
  const falls = outcome.falls.slice(-100).reduce((sum, value) => sum + value, 0);
  const late = outcome.returns.slice(-100).reduce((sum, value) => sum + value, 0) / 100;
  const rows = outcome.route
    .filter((square) => square % COLUMNS > 0 && square % COLUMNS < COLUMNS - 1)
    .map((square) => Math.floor(square / COLUMNS));
  const clearance = rows.length ? ROWS - 1 - Math.max(...rows) : 0;
  const arrives = outcome.routeEnds === "goal";
  byId("rl-exploration-value").textContent = `${Math.round(settings.exploration * 100)}%`;
  byId("stat-1").textContent = arrives ? String(outcome.route.length - 1) : "never arrives";
  byId("stat-2").textContent = arrives ? String(outcome.routeReward) : "–";
  byId("stat-3").textContent = String(falls);
  byId("stat-4").textContent = !arrives
    ? "Lost"
    : clearance === 1
      ? "The edge route"
      : "The safe route";
  byId("rl-prose").textContent = !arrives
    ? `After ${EPISODES} trips the agent's best guesses do not lead to the goal at all. Some square along the way was visited too rarely for its guess to be corrected. More trips, or more exploration, would fix it.`
    : clearance === 1
      ? `The agent takes the edge route: ${outcome.route.length - 1} moves for ${outcome.routeReward}, the best any route can pay, one square from the cliff all the way. While learning, with ${Math.round(settings.exploration * 100)}% of moves random, it fell ${falls} times in its last hundred trips and earned ${late.toFixed(0)} a trip. ${settings.algorithm === "q-learning" ? "Q-learning's guesses assume every future move will be the best one, so the edge looks safe to them, whatever keeps happening." : "Even SARSA takes the edge when it explores this little: the slips are rare enough not to matter."}`
      : `The agent keeps ${clearance} squares clear of the cliff: ${outcome.route.length - 1} moves for ${outcome.routeReward}, against ${BEST_ROUTE} for the edge route. While learning it fell ${falls} times in its last hundred trips and earned ${late.toFixed(0)} a trip. ${settings.algorithm === "sarsa" ? "SARSA's guesses include its own random moves, so a square by the cliff looks as dangerous as it really is for an agent that explores." : "Q-learning usually prefers the edge; this run found the safer route worth more."}`;
}

function schedule(): void {
  byId("rl-exploration-value").textContent = `${Math.round(Number(exploration.value) * 100)}%`;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

algorithm.addEventListener("change", schedule);
exploration.addEventListener("input", schedule);
render();
window.addEventListener(THEME_EVENT, render);
initLessonPage();
