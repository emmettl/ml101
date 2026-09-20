import corpus from "../data/alice.txt?raw";
import { copiedShare, generate, normalise, realWordShare, vocabularyOf } from "../language/ngram";
import { renderGenerated } from "../language/view";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { nextSeed, seededRandom } from "../shared/random";

const PROMPT = "alice ";
const LENGTH = 420;
const text = normalise(corpus);
const vocabulary = vocabularyOf(text);

const context = byId<HTMLInputElement>("lm-context");
const temperature = byId<HTMLInputElement>("lm-temperature");
let seed = 4;
let frame = 0;

function verdict(real: number, copied: number): string {
  if (copied > 0.5) return "Reciting";
  if (real > 0.95) return "Composing";
  if (real > 0.6) return "Nearly words";
  return real > 0.25 ? "Word-shaped" : "Noise";
}

function prose(length: number, real: number, copied: number, heat: number): string {
  const hot =
    heat >= 1.8
      ? " The temperature is high, so unlikely characters get picked far more often. With little context that wrecks the spelling; with more, there are fewer unlikely options left to pick."
      : heat <= 0.4
        ? " The temperature is low, so it nearly always takes the favourite, and tends to circle back to the same phrases."
        : "";
  if (length === 0)
    return `With no context it knows only how common each character is: plenty of spaces and e's, in no order. ${(real * 100).toFixed(0)}% of these “words” are real, by accident.${hot}`;
  if (copied > 0.5)
    return `With ${length} characters in view, ${(copied * 100).toFixed(0)}% of this is lifted word for word from the book. A run that long occurs only once, so at each step there is a single continuation on offer and the machine has no choice but to recite. It looks fluent. It has learned nothing new.${hot}`;
  if (real > 0.95)
    return `With ${length} characters in view every word is a real one, and ${copied < 0.05 ? "none" : `only ${(copied * 100).toFixed(0)}%`} of the text is copied. It is stitching together fragments of phrases it has seen into sentences it has not. There is still no meaning, because ${length} characters is too short a memory to hold a thought.${hot}`;
  return `With ${length} character${length === 1 ? "" : "s"} in view, ${(real * 100).toFixed(0)}% of the words are real. It has picked up which letters follow which, so the output is ${real > 0.6 ? "mostly spelled correctly but goes nowhere" : "pronounceable but not yet English"}.${hot}`;
}

function render(): void {
  const length = Number(context.value);
  const heat = Number(temperature.value);
  const generated = generate(text, PROMPT, LENGTH, length, heat, 40, seededRandom(seed)).text.slice(
    PROMPT.length,
  );
  const real = realWordShare(vocabulary, generated);
  const copied = copiedShare(text, generated);
  renderGenerated(byId("lm-output"), text, PROMPT, generated);
  byId("lm-context-value").textContent = String(length);
  byId("lm-temperature-value").textContent = heat.toFixed(1);
  byId("stat-1").textContent = length === 1 ? "1 character" : `${length} characters`;
  byId("stat-2").textContent = `${(real * 100).toFixed(0)}%`;
  byId("stat-3").textContent = `${(copied * 100).toFixed(0)}%`;
  byId("stat-4").textContent = verdict(real, copied);
  byId("lm-prose").textContent = prose(length, real, copied, heat);
}

function schedule(): void {
  byId("lm-context-value").textContent = context.value;
  byId("lm-temperature-value").textContent = Number(temperature.value).toFixed(1);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

context.addEventListener("input", schedule);
temperature.addEventListener("input", schedule);
byId("lm-again").addEventListener("click", () => {
  seed = nextSeed(seed);
  render();
});

render();
initLessonPage();
