/** Rendering shared by the retrieval lesson and lab: ranked passages with the reasons they ranked. */

import type { Index, Match, Word } from "./engine";

export interface Span {
  start: number;
  end: number;
}

export const holds = (index: Index, chunk: number, span: Span | undefined): boolean =>
  span !== undefined &&
  index.chunks[chunk].start <= span.start &&
  index.chunks[chunk].end >= span.end;

/** Passage text with the matched words in bold and the evidence, if it is here, underlined. */
export function passageNodes(
  text: string,
  words: readonly Word[],
  index: Index,
  match: Match,
  span: Span | undefined,
): Node[] {
  const passage = index.chunks[match.chunk];
  const matched = new Set(match.shared.map((entry) => entry.stem));
  const plain = (host: Node[], from: number, to: number): void => {
    let at = from;
    for (let w = passage.from; w < passage.to; w += 1) {
      const word = words[w];
      if (word.end <= from || word.start >= to || !matched.has(word.stem)) continue;
      if (word.start > at) host.push(document.createTextNode(text.slice(at, word.start)));
      const hit = document.createElement("b");
      hit.textContent = text.slice(word.start, word.end);
      host.push(hit);
      at = word.end;
    }
    if (at < to) host.push(document.createTextNode(text.slice(at, to)));
  };
  const nodes: Node[] = [];
  if (!holds(index, match.chunk, span) || !span) {
    plain(nodes, passage.start, passage.end);
    return nodes;
  }
  plain(nodes, passage.start, span.start);
  const evidence = document.createElement("mark");
  evidence.title = "The words that answer the question";
  const inside: Node[] = [];
  plain(inside, span.start, span.end);
  evidence.append(...inside);
  nodes.push(evidence);
  plain(nodes, span.end, passage.end);
  return nodes;
}

/** Matching is done on stems ("bottl"); people should be shown the word as the book spells it. */
function surfaceOf(
  text: string,
  words: readonly Word[],
  index: Index,
  chunk: number,
  stem: string,
): string {
  const passage = index.chunks[chunk];
  for (let w = passage.from; w < passage.to; w += 1)
    if (words[w].stem === stem) return text.slice(words[w].start, words[w].end).toLowerCase();
  return stem;
}

export function whereabouts(index: Index, chunk: number, length: number): string {
  const share = Math.round((index.chunks[chunk].start / length) * 100);
  return `passage ${chunk + 1} of ${index.chunks.length}, ${share}% of the way through`;
}

/**
 * One collapsible card per passage handed over. The summary line carries the rank, the score,
 * the words that earned it and whether the answer is inside; the body is the passage itself.
 */
export function renderPassages(
  host: HTMLElement,
  text: string,
  words: readonly Word[],
  index: Index,
  matches: readonly Match[],
  span: Span | undefined,
): void {
  const open = new Set(
    [...host.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
      (node) => node.dataset.rank,
    ),
  );
  const first = host.childElementCount === 0;
  host.replaceChildren(
    ...matches.map((match, at) => {
      const item = document.createElement("li");
      const card = document.createElement("details");
      card.dataset.rank = String(at + 1);
      card.open = first ? at === 0 : open.has(String(at + 1));
      const answer = holds(index, match.chunk, span);
      if (answer) item.className = "has-answer";
      const summary = document.createElement("summary");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(at + 1);
      const track = document.createElement("span");
      track.className = "track";
      track.setAttribute("aria-hidden", "true");
      const fill = document.createElement("span");
      fill.className = "fill";
      fill.style.width = `${(match.score * 100).toFixed(1)}%`;
      track.append(fill);
      const why = document.createElement("span");
      why.className = "why";
      const reasons = match.shared
        .slice(0, 4)
        .map((entry) => {
          const surface = surfaceOf(text, words, index, match.chunk, entry.stem);
          return entry.via ? `${entry.via} ≈ ${surface}` : surface;
        })
        .join(", ");
      why.textContent = `similarity ${match.score.toFixed(2)} · ${reasons ? `matched on ${reasons}` : "no one word accounts for it"}`;
      summary.append(rank, track, why);
      if (answer) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "holds the answer";
        summary.append(badge);
      }
      const body = document.createElement("p");
      body.append(...passageNodes(text, words, index, match, span));
      const place = document.createElement("small");
      place.textContent = whereabouts(index, match.chunk, text.length);
      card.append(summary, body, place);
      item.append(card);
      return item;
    }),
  );
  if (matches.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent =
      "Nothing in the book shares a single meaningful word with this question, so no passage scores above zero.";
    host.append(item);
  }
}

const clip = (passage: string, limit: number): string => {
  const parts = passage.split(/\s+/);
  return parts.length <= limit
    ? passage
    : `${parts.slice(0, limit).join(" ")} … [${parts.length - limit} more words]`;
};

/** The text that would actually be sent to a language model. Retrieval-augmented generation is this string. */
export function promptFor(
  text: string,
  index: Index,
  matches: readonly Match[],
  question: string,
  clipTo = 28,
): string {
  const passages = matches.map(
    (match, at) =>
      `[${at + 1}] ${clip(text.slice(index.chunks[match.chunk].start, index.chunks[match.chunk].end), clipTo)}`,
  );
  return [
    "Answer the question using only the numbered passages below.",
    "Say which passage you used. If the answer is not in them, say so.",
    "",
    ...passages,
    "",
    `Question: ${question}`,
  ].join("\n");
}

export function list(items: readonly string[]): string {
  const quoted = items.map((item) => `“${item}”`);
  return quoted.length <= 1
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}
