import {
  LADDER,
  bytesInWords,
  durationInWords,
  inWords,
  readingYears,
  weightBytes,
} from "../scale/engine";
import { drawLadder } from "../scale/view";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";

const chart = byId<SVGSVGElement>("lesson-chart");
const slider = byId<HTMLInputElement>("scale-rung");
slider.max = String(LADDER.length - 1);

function prose(index: number): string {
  const rung = LADDER[index];
  const first = LADDER[0];
  const times = rung.parameters / first.parameters;
  const against =
    index === 0
      ? "This is where the course began: two knobs, fitted by hand."
      : `That is ${inWords(times)} times the straight line you fitted by hand.`;
  const data = rung.tokens
    ? ` It was trained on ${inWords(rung.tokens)} tokens. Reading eight hours a day, a person would need ${durationInWords(readingYears(rung.tokens) * 365)} to get through that.`
    : rung.course
      ? " You trained it in your browser in a second or two."
      : " Its makers did not publish a token count in the form used here.";
  return `${rung.name}${rung.year ? ` (${rung.year})` : ""}: ${inWords(rung.parameters)} knobs. ${rung.note} ${against}${data}`;
}

function render(): void {
  const index = Number(slider.value);
  const rung = LADDER[index];
  drawLadder(chart, index);
  byId("scale-rung-value").textContent = rung.name;
  byId("stat-1").textContent = inWords(rung.parameters);
  byId("stat-2").textContent = bytesInWords(weightBytes(rung.parameters, rung.course ? 8 : 2));
  byId("stat-3").textContent = rung.tokens
    ? `${inWords(rung.tokens)} tokens`
    : rung.course
      ? "a few hundred examples"
      : "not comparable";
  byId("stat-4").textContent = rung.tokens
    ? durationInWords(readingYears(rung.tokens) * 365)
    : rung.course
      ? "a minute or two"
      : "–";
  byId("scale-prose").textContent = prose(index);
}

slider.addEventListener("input", render);
render();
redrawOnResize([chart], render);
initLessonPage();
