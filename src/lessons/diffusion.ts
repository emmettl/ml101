import { STEPS, drown, makeSchedule, makeShape, type Shape } from "../diffusion/engine";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { createPlot, redrawOnResize } from "../shared/plot";
import { normalRandom, seededRandom } from "../shared/random";

const schedule = makeSchedule();
const chart = byId<SVGSVGElement>("lesson-chart");
const shape = byId<HTMLSelectElement>("draw-shape");
const stage = byId<HTMLInputElement>("draw-stage");
const NAMES: Record<string, string> = {
  ring: "the ring",
  heart: "the heart",
  moons: "the two moons",
  spiral: "the spiral",
};
let frame = 0;

function render(): void {
  const t = Number(stage.value);
  const points = makeShape(shape.value as Shape, 400, 20260920);
  const random = seededRandom(3);
  const drowned = points.map((point) =>
    t === 0
      ? point
      : drown(point, t - 1, schedule, { x: normalRandom(random), y: normalRandom(random) }),
  );
  const plot = createPlot(chart, {
    base: { width: 760, height: 460 },
    xRange: [-2.6, 2.6],
    yRange: [-2.6, 2.6],
    xTicks: [],
    yTicks: [],
    minimumHeightShare: 0.85,
  });
  for (const point of points) plot.circle(point.x, point.y, 2, "faint");
  for (const point of drowned) plot.circle(point.x, point.y, 3.2, "drawn");
  const keep = t === 0 ? 1 : schedule.keep[t - 1];
  byId("draw-stage-value").textContent = `${t} of ${STEPS}`;
  byId("stat-1").textContent = `${(keep * 100).toFixed(keep < 0.01 ? 1 : 0)}%`;
  byId("stat-2").textContent = `${((1 - keep) * 100).toFixed(0)}%`;
  byId("stat-3").textContent =
    t === 0 ? "none" : 1 - keep < 0.25 ? "a little" : 1 - keep < 0.75 ? "a lot" : "almost all";
  byId("stat-4").textContent = keep > 0.5 ? "Recognisable" : keep > 0.1 ? "Fading" : "Gone";
  byId("draw-prose").textContent =
    t === 0
      ? `Stage 0: ${NAMES[shape.value]}, undrowned. Each stage mixes in a little more noise and keeps a little less of the point, on a fixed schedule the network is told about.`
      : keep > 0.5
        ? `Stage ${t} of ${STEPS}: ${(keep * 100).toFixed(0)}% of each point is still signal and ${((1 - keep) * 100).toFixed(0)}% is noise, and ${NAMES[shape.value]} still shows. Asked to guess the noise here, the network has an easy job: whatever does not look like the shape is noise.`
        : keep > 0.02
          ? `Stage ${t} of ${STEPS}: only ${(keep * 100).toFixed(0)}% of each point is still signal. The shape is a rumour in the cloud. Guessing the noise here means guessing roughly which way the shape lies, which is all a drawing needs at its first steps.`
          : `Stage ${t} of ${STEPS}: ${(keep * 100).toFixed(1)}% of each point is still signal, which is nothing. This is pure noise, and it is where every drawing starts. No network can guess the noise here, and none needs to: any direction will do, and the next stage will correct it.`;
}

function schedule_(): void {
  byId("draw-stage-value").textContent = `${stage.value} of ${STEPS}`;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

shape.addEventListener("change", schedule_);
stage.addEventListener("input", schedule_);
render();
redrawOnResize([chart], render);
initLessonPage();
