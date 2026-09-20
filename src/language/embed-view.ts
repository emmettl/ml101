/** Drawing for tokens and word embeddings, shared by lesson 05 and its lab. */

import { createPlot, type Plot } from "../shared/plot";
import { WORD_START } from "./bpe";
import {
  DISPLAY_WORDS,
  PEOPLE,
  meaningAxes,
  project,
  solveAnalogy,
  vectorOf,
  type Analogy,
  type Embeddings,
} from "./embeddings";

/** One chip per token; a token that begins a word gets a bar on its left edge. */
export function renderTokens(host: HTMLElement, tokens: readonly string[]): void {
  host.replaceChildren(
    ...tokens.map((token) => {
      const chip = document.createElement("li");
      const startsWord = token.startsWith(WORD_START);
      if (startsWord) chip.className = "word-start";
      chip.textContent = startsWord ? token.slice(WORD_START.length) || "·" : token;
      return chip;
    }),
  );
}

function padded(values: readonly number[]): readonly [number, number] {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max(0.15, (high - low) * 0.18);
  return [low - pad, high + pad];
}

/** A two-dimensional model drawn as it is: where training has put each word. */
export function drawFamilyMap(svg: SVGSVGElement, model: Embeddings): Plot {
  const at = DISPLAY_WORDS.map((entry) => ({ ...entry, vector: vectorOf(model, entry.word) }));
  const plot = createPlot(svg, {
    base: { width: 560, height: 440 },
    xRange: padded(at.map((entry) => entry.vector[0])),
    yRange: padded(at.map((entry) => entry.vector[1])),
    xTicks: [],
    yTicks: [],
    minimumHeightShare: 0.85,
  });
  for (const entry of at) {
    plot.circle(entry.vector[0], entry.vector[1], 5, `group-${entry.group}`);
    plot.text(entry.vector[0], entry.vector[1], entry.word, "plot-word").setAttribute("dy", "-9");
  }
  return plot;
}

/**
 * The eight people placed by two directions found in the vectors themselves: female − male
 * across, royal − common up. With an analogy, the arithmetic is drawn as arrows.
 */
export function drawMeaningMap(svg: SVGSVGElement, model: Embeddings, analogy?: Analogy): Plot {
  const axes = meaningAxes(model);
  const place = (vector: ArrayLike<number>) =>
    [project(vector, axes.gender), project(vector, axes.rank)] as const;
  const people = PEOPLE.map((person) => ({ ...person, at: place(vectorOf(model, person.word)) }));
  const solved = analogy ? solveAnalogy(model, analogy) : undefined;
  const target = solved ? place(solved.target) : undefined;
  const xs = [...people.map((person) => person.at[0]), ...(target ? [target[0]] : [])];
  const ys = [...people.map((person) => person.at[1]), ...(target ? [target[1]] : [])];
  const plot = createPlot(svg, {
    base: { width: 560, height: 440 },
    xRange: padded(xs),
    yRange: padded(ys),
    xLabel: "← more male · a direction found in the vectors · more female →",
    yLabel: "← common · royal →",
    xTicks: [],
    yTicks: [],
    minimumHeightShare: 0.85,
  });
  if (analogy && target) {
    const find = (word: string) => people.find((person) => person.word === word)?.at ?? [0, 0];
    const a = find(analogy.a);
    const b = find(analogy.b);
    const c = find(analogy.c);
    plot.line([b, a], "arrow ghost");
    plot.line([c, target], "arrow");
    plot.circle(target[0], target[1], 11, "target");
  }
  for (const person of people) {
    plot.circle(person.at[0], person.at[1], 5.5, `group-${person.group}`);
    plot.text(person.at[0], person.at[1], person.word, "plot-word").setAttribute("dy", "-10");
  }
  return plot;
}
