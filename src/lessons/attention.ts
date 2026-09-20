import {
  QUERY_FOR,
  attend,
  blend,
  effectiveCount,
  focusIndex,
  readingOf,
  sentence,
  strongest,
  type Ending,
} from "../language/attention";
import { drawArcs } from "../language/attention-view";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";

const chart = byId<SVGSVGElement>("lesson-chart");
const ending = byId<HTMLSelectElement>("attn-ending");
const sharpness = byId<HTMLInputElement>("attn-sharpness");

function prose(top: string, share: number, count: number, reading: string, focus: number): string {
  if (focus === 0)
    return `With no focus every one of the other eleven words gets the same 9% share. “it” becomes the average of the whole sentence, which reads as ${reading}. All the words are present and none of the structure is: nothing says who was tired.`;
  if (focus >= 3)
    return `At this focus “it” gives ${(share * 100).toFixed(0)}% of its attention to “${top}” and almost nothing to anything else. That is decisive, and brittle: one slightly mismatched badge and it would lock on to the wrong word just as firmly.`;
  return `“it” listens mostly to “${top}” (${(share * 100).toFixed(0)}%), with the rest spread thinly, as if about ${count.toFixed(1)} words shared its attention. Blending what it heard, “it” now reads as ${reading}. Change the last word of the sentence and watch the thick arc jump.`;
}

function render(): void {
  const words = sentence(ending.value as Ending);
  const from = focusIndex(words);
  const focus = Number(sharpness.value);
  const { scores, weights } = attend(QUERY_FOR[ending.value as Ending], words, from, focus);
  drawArcs(chart, words, weights, scores, from);
  const top = strongest(weights);
  const mix = blend(words, weights);
  const reading = readingOf(mix.living, mix.place);
  const count = effectiveCount(weights);
  byId("attn-sharpness-value").textContent = focus.toFixed(1);
  byId("stat-1").textContent = focus === 0 ? "everyone equally" : words[top].text;
  byId("stat-2").textContent = `${(weights[top] * 100).toFixed(0)}%`;
  byId("stat-3").textContent = count.toFixed(1);
  byId("stat-4").textContent = reading;
  byId("attn-prose").textContent = prose(words[top].text, weights[top], count, reading, focus);
}

ending.addEventListener("change", render);
sharpness.addEventListener("input", render);
render();
redrawOnResize([chart], render);
initLessonPage();
