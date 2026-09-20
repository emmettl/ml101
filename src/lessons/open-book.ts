import corpus from "../data/alice.txt?raw";
import {
  buildIndex,
  chunkWords,
  locate,
  retrieve,
  unknownWords,
  wordsOf,
} from "../retrieval/engine";
import { QUESTIONS } from "../retrieval/questions";
import { holds, list, renderPassages } from "../retrieval/view";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";

const PASSAGE_WORDS = 60;
const text = corpus.trim();
const words = wordsOf(text);
const index = buildIndex(words, chunkWords(words, PASSAGE_WORDS, 0.25));

const picker = byId<HTMLSelectElement>("ob-question");
const keep = byId<HTMLInputElement>("ob-keep");
let frame = 0;

function render(): void {
  const question = QUESTIONS.find((entry) => entry.id === picker.value) ?? QUESTIONS[0];
  const count = Number(keep.value);
  const span = locate(text, question);
  const matches = retrieve(index, question.ask, count);
  const place = matches.findIndex((match) => holds(index, match.chunk, span)) + 1;
  const deepest = retrieve(index, question.ask, Number(keep.max));
  const reachable = deepest.findIndex((match) => holds(index, match.chunk, span)) + 1;
  const handed = matches.reduce(
    (total, match) => total + index.chunks[match.chunk].to - index.chunks[match.chunk].from,
    0,
  );
  renderPassages(byId("ob-passages"), text, words, index, matches, span);
  byId("ob-keep-value").textContent = String(count);
  byId("stat-1").textContent = index.chunks.length.toLocaleString("en-GB");
  byId("stat-2").textContent = matches.length ? matches[0].score.toFixed(2) : "0";
  byId("stat-3").textContent = handed.toLocaleString("en-GB");
  byId("stat-4").textContent = place > 0 ? `Yes, ranked ${place}` : "No";

  const unknown = unknownWords(index, question.ask);
  byId("ob-prose").textContent =
    place === 1
      ? `The best match holds the answer (“${question.answer}”). The question and the passage share several words that are rare in the rest of the book, which is exactly what this kind of search rewards. One passage, ${handed} words, and the model has what it needs.`
      : place > 1
        ? `The answer (“${question.answer}”) is in the passage ranked ${place}. The ${place === 2 ? "passage" : "passages"} above it shared more words with the question without answering it. Handing over ${count} costs ${handed} words of reading where one good match would have cost ${PASSAGE_WORDS}.`
        : unknown.length > 0 && reachable === 0
          ? `None of these holds the answer (“${question.answer}”), and handing over more will not help. The book never uses ${list(unknown)}, so the search ran on the few words that were left, and they are common ones. A model given these passages has nothing to answer from.`
          : `None of the ${count} handed over holds the answer (“${question.answer}”). ${reachable > 0 ? `It is there, ranked ${reachable}: the passages above it share more words with the question, because the book mentions these things in several places.` : "It is not among the top eight either."} Keep going.`;
}

function schedule(): void {
  byId("ob-keep-value").textContent = keep.value;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

picker.addEventListener("change", schedule);
keep.addEventListener("input", schedule);

render();
initLessonPage();
