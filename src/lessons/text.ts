import corpus from "../data/alice.txt?raw";
import { WORD_START, learnMerges, tokenise } from "../language/bpe";
import { drawMeaningMap, renderTokens } from "../language/embed-view";
import {
  ANALOGIES,
  createEmbeddings,
  makeCorpus,
  solveAnalogy,
  trainEmbeddings,
} from "../language/embeddings";
import { normalise } from "../language/ngram";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";

const MAX_MERGES = 400;
const merges = learnMerges(normalise(corpus), MAX_MERGES);

const slider = byId<HTMLInputElement>("bpe-merges");
const sentence = byId<HTMLSelectElement>("bpe-sentence");

const show = (piece: string): string => piece.replace(WORD_START, "");

function prose(use: number, tokens: string[], characters: number): string {
  const whole = tokens.filter((token) => token.startsWith(WORD_START)).length;
  const words = sentence.value.split(" ").length;
  if (use === 0)
    return `No merges yet, so every character is its own token: ${tokens.length} of them. A model reading this would have to work out spelling before it could work out anything else.`;
  const familiar = sentence.selectedIndex === 0;
  if (tokens.length <= words + 1)
    return `After ${use} merges every word here is a single token: ${tokens.length} tokens for ${characters} characters. These are common words in the book the tokeniser was built from, so each earned an entry of its own.`;
  return familiar
    ? `After ${use} merges the text needs ${tokens.length} tokens, down from ${characters + words}. The common words fused first. Keep going and the rest will follow.`
    : `After ${use} merges this text still needs ${tokens.length} tokens for ${words} words (${whole} pieces start a word; the rest are fragments). The tokeniser never met these words, so it spells them from pieces it has. A model sees those fragments, not the word.`;
}

function renderTokeniser(): void {
  const use = Number(slider.value);
  const tokens = tokenise(sentence.value, merges, use);
  const characters = sentence.value.replace(/\s+/g, "").length;
  renderTokens(byId("bpe-chips"), tokens);
  byId("bpe-merges-value").textContent = String(use);
  byId("stat-1").textContent = String(use);
  byId("stat-2").textContent = String(tokens.length);
  byId("stat-3").textContent = (characters / tokens.length).toFixed(1);
  const latest = merges[use - 1];
  byId("stat-4").textContent = latest ? `${show(latest.left)} + ${show(latest.right)}` : "none yet";
  byId("bpe-prose").textContent = prose(use, tokens, characters);
}

const model = createEmbeddings(makeCorpus(20260920), 8, 3);
trainEmbeddings(model, 20_000, 103);
const figure = byId<SVGSVGElement>("embedding-figure");

function renderFigure(): void {
  const analogy = ANALOGIES[0];
  drawMeaningMap(figure, model, analogy);
  const solved = solveAnalogy(model, analogy);
  byId("embedding-caption").textContent =
    `Trained in your browser a moment ago, from random starting points. The dashed arrow is the step from “${analogy.b}” to “${analogy.a}”. The solid arrow is the same step taken from “${analogy.c}”. The ring marks where it lands; the nearest word is “${solved.ranked[0].word}” (similarity ${solved.ranked[0].similarity.toFixed(2)}, where 1.00 is identical).`;
}

slider.addEventListener("input", renderTokeniser);
sentence.addEventListener("change", renderTokeniser);
renderTokeniser();
renderFigure();
redrawOnResize([figure], renderFigure);
initLessonPage();
