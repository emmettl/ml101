/** Rendering shared by the language lesson and lab: generated text, and the odds for what comes next. */

import { copiedSpans, type NextChoice } from "./ngram";

const SPACE = "␣";

/** The prompt in grey, the model's text after it, and any word-for-word recitation underlined. */
export function renderGenerated(
  host: HTMLElement,
  source: string,
  prompt: string,
  generated: string,
): void {
  const promptNode = document.createElement("span");
  promptNode.className = "prompt";
  promptNode.textContent = prompt;
  const nodes: Node[] = [promptNode];
  let at = 0;
  for (const span of copiedSpans(source, generated)) {
    if (span.start > at) nodes.push(document.createTextNode(generated.slice(at, span.start)));
    const mark = document.createElement("mark");
    mark.textContent = generated.slice(span.start, span.end);
    mark.title = "This stretch appears word for word in the book";
    nodes.push(mark);
    at = span.end;
  }
  if (at < generated.length) nodes.push(document.createTextNode(generated.slice(at)));
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  nodes.push(cursor);
  host.replaceChildren(...nodes);
}

/**
 * One bar per candidate. The bar is the chance after temperature and top-k; the figure beside
 * it is the raw share in the book, so the reshaping is visible.
 */
export function renderOdds(
  host: HTMLElement,
  raw: readonly NextChoice[],
  reshaped: readonly NextChoice[],
  limit = 10,
): void {
  const kept = new Map(reshaped.map((choice) => [choice.token, choice.probability]));
  host.replaceChildren(
    ...raw.slice(0, limit).map((choice) => {
      const item = document.createElement("li");
      const chance = kept.get(choice.token);
      if (chance === undefined) item.className = "cut";
      const token = document.createElement("span");
      token.className = "token";
      if (choice.token === " ") {
        const glyph = document.createElement("span");
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = SPACE;
        const spoken = document.createElement("span");
        spoken.className = "visually-hidden";
        spoken.textContent = "space";
        token.append(glyph, spoken);
      } else token.textContent = choice.token;
      const track = document.createElement("span");
      track.className = "track";
      const fill = document.createElement("span");
      fill.className = "fill";
      fill.style.width = `${((chance ?? 0) * 100).toFixed(1)}%`;
      track.append(fill);
      const odds = document.createElement("span");
      odds.className = "odds";
      odds.textContent =
        chance === undefined
          ? `cut · book ${(choice.probability * 100).toFixed(0)}%`
          : `${(chance * 100).toFixed(0)}% · book ${(choice.probability * 100).toFixed(0)}%`;
      item.append(token, track, odds);
      return item;
    }),
  );
}

export const showContext = (context: string): string =>
  context === "" ? "nothing at all" : `“${context.replace(/ /g, SPACE)}”`;
