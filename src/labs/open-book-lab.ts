import corpus from "../data/alice.txt?raw";
import {
  buildIndex,
  chunkWords,
  cutByBoundary,
  found,
  locate,
  retrieve,
  sitExam,
  unknownWords,
  wordsOf,
  type Exam,
  type Index,
  type Match,
} from "../retrieval/engine";
import {
  buildDenseIndex,
  buildLexicon,
  decodeVectors,
  neighboursOf,
  retrieveByMeaning,
  retrieveWithNeighbours,
  unknownToVectors,
  type DenseIndex,
  type Lexicon,
  type WordVectors,
} from "../retrieval/dense";
import { decodeRows, passageFile, retrieveByEncoder } from "../retrieval/encoder";
import source from "../retrieval/engine.ts?raw";
import { QUESTIONS } from "../retrieval/questions";
import { holds, list, promptFor, renderPassages } from "../retrieval/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

const text = corpus.trim();
const words = wordsOf(text);
const SIZES = [15, 25, 40, 60, 100, 150, 250, 400];
const DEEPEST = 10;
const BOOK = QUESTIONS.filter((question) => question.wording === "book").length;
const OWN = QUESTIONS.length - BOOK;

const VECTOR_SIZE = 50;
type Method = "words" | "neighbours" | "average" | "encoder" | "both";
const METHOD_NAMES: Record<Method, string> = {
  words: "shared words",
  neighbours: "shared words plus near-meanings",
  average: "one learned vector per passage",
  encoder: "a passage encoder",
  both: "shared words and the encoder, merged",
};
const passageUrls = import.meta.glob<string>("../data/passages/*.bin", {
  query: "?url",
  import: "default",
});

interface Params extends Record<string, number | string> {
  question: string;
  method: string;
  size: number;
  overlap: number;
  keep: number;
}

const defaults: Params = { question: "bottle", method: "words", size: 60, overlap: 0, keep: 3 };
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "question",
    label: "Question",
    options: QUESTIONS.map((question) => ({
      value: question.id,
      label: `${question.wording === "book" ? "Book's words" : "Reader's words"}: ${question.ask}`,
    })),
    help: "Twelve are asked in the book's own words, twelve the way a reader without the book would ask.",
  },
  {
    type: "select",
    key: "method",
    label: "How passages are matched",
    options: [
      { value: "words", label: "Shared words" },
      { value: "neighbours", label: "Shared words, plus near-meanings for words the book lacks" },
      { value: "average", label: "One learned vector per passage (the average of its words)" },
      {
        value: "encoder",
        label: "A passage encoder: a transformer trained to match questions to answers",
      },
      { value: "both", label: "Both: shared words and the encoder, rankings merged" },
    ],
    help: "Everything but the first is fetched when first chosen. The encoder's vectors were computed ahead of time, so it can answer the 24 set questions but not one you type.",
  },
  {
    type: "range",
    key: "size",
    label: "Passage length",
    min: 0,
    max: SIZES.length - 1,
    step: 1,
    toParam: (position) => SIZES[position],
    fromParam: (value) => SIZES.indexOf(value),
    format: (value) => `${value} words`,
    help: "The book is cut into passages this long before anything is searched.",
  },
  {
    type: "select",
    key: "overlap",
    label: "Overlap between passages",
    options: [
      { value: "0", label: "None: each passage starts where the last ended" },
      { value: "0.25", label: "A quarter" },
      { value: "0.5", label: "Half" },
    ],
  },
  {
    type: "range",
    key: "keep",
    label: "Passages handed to the model",
    min: 1,
    max: DEEPEST,
    step: 1,
    format: (value) => String(value),
  },
];

const chart = byId<SVGSVGElement>("book-chart");
const ownInput = byId<HTMLInputElement>("book-own");
let index: Index = buildIndex(words, chunkWords(words, params.size, params.overlap));
let exam: Exam = sitExam(index, text, QUESTIONS, DEEPEST);
/** The same exam sat by plain word matching, for comparison when another method is chosen. */
let wordExam: Exam = exam;
let vectors: WordVectors | undefined;
let lexicon: Lexicon | undefined;
let dense: DenseIndex | undefined;
let loading: Promise<void> | undefined;
let loadFailed = false;
/** The encoder's vector for each set question, by its wording, and for each passage setting. */
let askedRows: Map<string, Float32Array> | undefined;
const passageRows = new Map<string, Float32Array[]>();
let request = 0;
/** A question typed by the learner. It has no answer key. */
let custom = "";
let frame = 0;

const isBook = (at: number): boolean => QUESTIONS[at].wording === "book";
const isOwn = (at: number): boolean => !isBook(at);
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

const usesWordVectors = (): boolean =>
  params.method === "neighbours" || params.method === "average";
const usesEncoder = (): boolean => params.method === "encoder" || params.method === "both";
const encoded = (): Float32Array[] | undefined =>
  passageRows.get(passageFile(params.size, params.overlap));

/** The method in force: anything learned falls back to words until its data has arrived. */
function method(): Method {
  if (usesWordVectors() && vectors) return params.method as Method;
  if (usesEncoder() && askedRows && encoded()?.length === index.chunks.length)
    return params.method as Method;
  return "words";
}

/** Reciprocal rank fusion: a passage scores by its place in each list, not by either score. */
function merged(lists: readonly Match[][], keep: number): Match[] {
  const fused = new Map<number, Match>();
  for (const matches of lists)
    matches.forEach((match, place) => {
      const entry = fused.get(match.chunk) ?? {
        chunk: match.chunk,
        score: 0,
        shared: match.shared,
      };
      entry.score += 1 / (60 + place + 1);
      fused.set(match.chunk, entry);
    });
  const best = lists.length / 61;
  return [...fused.values()]
    .map((match) => ({ ...match, score: match.score / best }))
    .sort((a, b) => b.score - a.score || a.chunk - b.chunk)
    .slice(0, keep);
}

function search(asked: string, keep: number): Match[] {
  const chosen = method();
  if (chosen === "neighbours" && lexicon)
    return retrieveWithNeighbours(index, lexicon, asked, keep);
  if (chosen === "average" && dense) return retrieveByMeaning(dense, asked, keep);
  const vector = askedRows?.get(asked);
  const passages = encoded();
  if ((chosen === "encoder" || chosen === "both") && vector && passages) {
    if (chosen === "encoder") return retrieveByEncoder(passages, vector, keep);
    return merged([retrieve(index, asked, 30), retrieveByEncoder(passages, vector, 30)], keep);
  }
  return retrieve(index, asked, keep);
}

function rebuild(): void {
  const chunks = chunkWords(words, params.size, params.overlap);
  index = buildIndex(words, chunks);
  dense =
    vectors && method() === "average" ? buildDenseIndex(text, words, chunks, vectors) : undefined;
  wordExam = sitExam(index, text, QUESTIONS, DEEPEST);
  exam = method() === "words" ? wordExam : sitExam(index, text, QUESTIONS, DEEPEST, search);
}

async function fetchRows(name: string): Promise<Float32Array[]> {
  const url = await passageUrls[`../data/passages/${name}`]();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${name} (${response.status})`);
  return decodeRows(new Int8Array(await response.arrayBuffer()));
}

/** Fetch the encoder's vectors for the set questions, and for the passage setting in force. */
async function loadEncoder(): Promise<void> {
  const name = passageFile(params.size, params.overlap);
  const [asked, passages] = await Promise.all([
    askedRows ? undefined : fetchRows("questions.bin"),
    passageRows.has(name) ? undefined : fetchRows(name),
  ]);
  if (asked) askedRows = new Map(QUESTIONS.map((question, at) => [question.ask, asked[at]]));
  if (passages) passageRows.set(name, passages);
}

/** Whatever the chosen method still needs from the network, or nothing. */
function missing(): { what: string; fetch: () => Promise<void> } | undefined {
  if (usesWordVectors() && !vectors)
    return { what: "the word vectors (0.6 MB)", fetch: loadVectors };
  if (usesEncoder() && !(askedRows && encoded()))
    return { what: "the encoder's vectors for these passages", fetch: loadEncoder };
  return undefined;
}

/** Fetch the word vectors the first time a learned method is chosen. */
function loadVectors(): Promise<void> {
  loading ??= (async () => {
    const [{ default: url }, { default: list }] = await Promise.all([
      import("../data/glove.bin?url"),
      import("../data/glove-words.txt?raw"),
    ]);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch the word vectors (${response.status})`);
    vectors = decodeVectors(
      list.trim().split("\n"),
      new Int8Array(await response.arrayBuffer()),
      VECTOR_SIZE,
    );
    lexicon = buildLexicon(text, words, vectors);
  })();
  return loading;
}

function drawSearch(): void {
  const question = QUESTIONS.find((entry) => entry.id === params.question) ?? QUESTIONS[0];
  const asked = custom || question.ask;
  const span = custom ? undefined : locate(text, question);
  const matches = search(asked, params.keep);
  byId("book-asked").textContent = asked;
  renderPassages(
    byId("book-passages"),
    text,
    words,
    index,
    matches,
    span,
    method() === "both" && !custom ? "combined rank" : "similarity",
  );
  byId("book-prompt").textContent = promptFor(text, index, matches, asked);

  const handed = matches.reduce(
    (total, match) => total + index.chunks[match.chunk].to - index.chunks[match.chunk].from,
    0,
  );
  byId("book-prompt-caption").textContent =
    `What the model receives: ${handed.toLocaleString("en-GB")} words of the book (clipped here for display), and your question`;

  const unknown = unknownWords(index, asked);
  const blind = unknown.length === 0 ? "" : ` ${aboutUnknown(unknown, asked)}`;
  const outcome = byId("book-outcome");
  if (custom) {
    outcome.textContent = `${usesEncoder() ? "The encoder is not on this page, so it cannot read a question you type: this search used shared words. " : ""}This is your own question, so there is no answer key to check against. Read the ${plural(matches.length, "passage")} and judge: would a careful reader be able to answer from these alone?${blind}`;
    return;
  }
  if (!span) return;
  const place = matches.findIndex((match) => holds(index, match.chunk, span)) + 1;
  const deeper = exam.ranks[QUESTIONS.indexOf(question)];
  if (place > 0)
    outcome.textContent = `The answer (“${question.answer}”) is in passage ${place} of the ${params.keep} handed over, underlined in green. A model that reads them can answer and say where it found it. ${place > 1 ? `It was not the top match, which is the case for handing over more than one.` : `It was the top match.`}${blind}`;
  else if (cutByBoundary(index, span))
    outcome.textContent = `No passage can hold this answer. At ${params.size} words with ${params.overlap === 0 ? "no overlap" : "this overlap"}, a boundary falls in the middle of the sentence that answers the question, so each neighbour has half of it. Overlap is the usual fix: the next passage starts before this one ends, and one of them gets the sentence whole.`;
  else
    outcome.textContent = `The answer (“${question.answer}”) is not in the ${plural(params.keep, "passage")} handed over. ${deeper > 0 ? `It is in the book's passage ranked ${deeper}, so handing over more would reach it, at the price of more to read.` : `It is not in the top ${DEEPEST} either.`} A model given these must either say it cannot tell, or make something up and cite a passage that does not support it.${blind}`;
}

/** What became of the question's words that the book never uses, under the method in force. */
function aboutUnknown(unknown: readonly string[], asked: string): string {
  const those = unknown.length === 1 ? "that word" : "those words";
  if (method() === "neighbours" && lexicon) {
    const book = lexicon;
    const helped = unknown
      .map((word) => ({ word, near: neighboursOf(book, word) }))
      .filter((entry) => entry.near.length > 0)
      .map(
        (entry) =>
          `“${entry.word}” sits nearest ${entry.near.map((near) => `${near.spelling} (${near.similarity.toFixed(2)})`).join(", ")}`,
      );
    const lost = unknown.filter((word) => neighboursOf(book, word).length === 0);
    return (
      `The book never uses ${list(unknown)}. ` +
      (helped.length > 0
        ? `Among the book's words, the embedding says ${helped.join("; ")}, so the search looked for those too, each discounted by its distance. `
        : "") +
      (lost.length > 0
        ? `Nothing in the book sits near ${list(lost)}${vectors && unknownToVectors(vectors, asked).length > 0 ? ", or the embedding does not know the word" : ""}, so ${lost.length === 1 ? "it" : "they"} still matched nothing.`
        : "")
    );
  }
  if (method() === "encoder" || method() === "both")
    return `The book never uses ${list(unknown)}. The encoder does not mind: it never looks for a word. It read the question whole and placed it among the passages by meaning.`;
  if (method() === "average")
    return `The book never uses ${list(unknown)}, which does not matter to this method: no word has to match, only the averages have to point the same way. Whether an average of ${params.size} words still points anywhere useful is what the score below measures.`;
  return `The book never uses ${list(unknown)}, so ${those} matched nothing and the search ran on what was left. Switch the matching to use near-meanings and see what a learned embedding makes of ${unknown.length === 1 ? "it" : "them"}.`;
}

function drawCurve(): void {
  const plot = createPlot(chart, {
    base: { width: 900, height: 300 },
    xRange: [1, DEEPEST],
    yRange: [0, Math.max(BOOK, OWN)],
    xLabel: "Passages handed to the model",
    yLabel: "Answers found (of 12)",
    xTicks: Array.from({ length: DEEPEST }, (_, at) => at + 1),
    yTicks: [0, 3, 6, 9, 12],
    xFormat: (value) => String(value),
  });
  plot.guide("x", params.keep, `handing over ${params.keep}`, "calm");
  const curve = (only: (at: number) => boolean) =>
    Array.from({ length: DEEPEST }, (_, at) => [at + 1, found(exam, at + 1, only)] as const);
  plot.line(curve(isBook), "train");
  plot.line(curve(isOwn), "held");
  for (const [keep, count] of curve(isBook)) plot.circle(keep, count, 3.5, "train");
  for (const [keep, count] of curve(isOwn)) plot.triangle(keep, count, 4.5, "held");
}

function drawScores(): void {
  const all = found(exam, params.keep);
  const book = found(exam, params.keep, isBook);
  const own = found(exam, params.keep, isOwn);
  const cut = exam.cut.filter(Boolean).length;
  const handed = params.keep * params.size;
  renderStats(byId("book-stats"), [
    { label: `Answers found, of ${QUESTIONS.length}`, value: String(all) },
    { label: `Asked in the book's words, of ${BOOK}`, value: String(book) },
    { label: `Asked in a reader's words, of ${OWN}`, value: String(own) },
    {
      label: "Answers cut in two by a boundary",
      value: String(cut),
      tone: cut > 0 ? "bad" : "good",
    },
    { label: "Words handed over per question", value: handed.toLocaleString("en-GB") },
  ]);

  byId("book-ledger").replaceChildren(
    ...QUESTIONS.map((question, at) => {
      const row = document.createElement("tr");
      if (!custom && question.id === params.question) row.className = "selected-observation";
      const rank = exam.ranks[at];
      const result = exam.cut[at]
        ? "Cut in two by a boundary"
        : rank === 0
          ? `Not in the top ${DEEPEST}`
          : rank <= params.keep
            ? `Found, ranked ${rank}`
            : `Missed: ranked ${rank}, only ${params.keep} handed over`;
      const cells = [
        question.ask,
        question.wording === "book" ? "Book's" : "Reader's",
        question.answer,
        result,
      ];
      row.append(
        ...cells.map((value, column) => {
          const cell = document.createElement(column === 0 ? "th" : "td");
          if (column === 0) cell.scope = "row";
          cell.textContent = value;
          return cell;
        }),
      );
      return row;
    }),
  );

  const share = (handed / words.length) * 100;
  byId("book-name").textContent =
    `${params.size}-word passages, ${plural(params.keep, "passage")} handed over`;
  const plain = found(wordExam, params.keep);
  const compared =
    method() === "words"
      ? ""
      : method() === "neighbours"
        ? `Matching shared words alone finds ${plain} at these settings. The embedding knows that “bunny” sits beside “rabbit”; that knowledge rescues some questions and sends others after near-misses such as “sooner” for “disappear”. `
        : method() === "encoder"
          ? `Matching shared words alone finds ${plain} at these settings. The encoder is a transformer that read each passage whole and was trained on 215 million question-and-answer pairs to place a question beside its answer. It never looks for a word, which is why it copes with a reader's wording, and also why it can lose to word matching on a question that quotes the book${params.size >= 250 ? "; and one vector is a small place to keep a passage this long" : ""}. `
          : method() === "both"
            ? `Shared words alone find ${plain} at these settings. Here each passage is scored by its place in both rankings, so either search can vouch for it. This is how many production systems now search: word matching for exact terms, an encoder for meaning. `
            : `Matching shared words alone finds ${plain} at these settings. Averaging blurs: by the time ${params.size} word vectors have been averaged, the one word that mattered has been outvoted. The embeddings that do beat word matching are transformers (lesson 06) that read a passage in context and are trained for this very job. They are far too large to run on this page. `;
  byId("book-description").textContent =
    (loadFailed && params.method !== "words"
      ? "The word vectors could not be fetched, so this is plain word matching. "
      : "") +
    `${all} of ${QUESTIONS.length} answers reach the model: ${book} of the ${BOOK} asked in the book's words and ${own} of the ${OWN} asked in a reader's. ` +
    compared +
    (cut > 0
      ? `${plural(cut, "answer")} cannot be found at any depth, because a passage boundary runs through the sentence. `
      : "") +
    (share >= 10
      ? `Each question now carries ${share.toFixed(0)}% of the whole book along with it. The answer is in there, and so is a great deal that is not the answer; the model has to find it, and you pay for every word.`
      : own < book - 2 && method() === "words"
        ? "The gap between the two kinds of question is the gap between matching words and matching meaning."
        : "");
  byId("book-simulation-status").textContent =
    `Current · ${METHOD_NAMES[method()]} · ${index.chunks.length.toLocaleString("en-GB")} passages of ${params.size} words · ${params.overlap === 0 ? "no overlap" : `${params.overlap * 100}% overlap`} · ${plural(params.keep, "passage")} handed over · ${QUESTIONS.length} questions with known answers`;
}

function drawAll(): void {
  drawSearch();
  drawCurve();
  drawScores();
}

function schedule(): void {
  byId("book-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(drawAll);
}

/** Rebuild for the current settings, first fetching whatever the chosen method still lacks. */
function refresh(): void {
  request += 1;
  const mine = request;
  const needed = missing();
  if (!needed) {
    rebuild();
    schedule();
    return;
  }
  byId("book-simulation-status").textContent = `Fetching ${needed.what}…`;
  needed
    .fetch()
    .then(
      () => {
        loadFailed = false;
      },
      () => {
        loadFailed = true;
      },
    )
    .finally(() => {
      if (mine !== request) return;
      rebuild();
      schedule();
    });
}

const panel = renderControls(byId("book-controls"), "book", controls, params, (key) => {
  if (key === "question") {
    custom = "";
    ownInput.value = "";
  }
  if (key === "size" || key === "overlap" || key === "method") refresh();
  else schedule();
});

byId<HTMLFormElement>("book-ask").addEventListener("submit", (event) => {
  event.preventDefault();
  custom = ownInput.value.trim().slice(0, 200);
  schedule();
});

byId("book-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  custom = "";
  ownInput.value = "";
  panel.sync();
  refresh();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole of retrieval: embed the question, score every passage, keep the best",
  source,
  marker: "retrieve",
  pythonCaption: "The same pipeline with a learned embedding and a real model",
  python: `from sentence_transformers import SentenceTransformer
import numpy as np

embedder = SentenceTransformer("multi-qa-MiniLM-L6-cos-v1")  # the passage encoder this lab uses

# Once, ahead of time: cut the documents up and embed every passage.
passages = [" ".join(words[i:i + 150]) for i in range(0, len(words), 110)]   # 150 words, overlapping
vectors = embedder.encode(passages, normalize_embeddings=True)

def retrieve(question, keep=3):
    asked = embedder.encode([question], normalize_embeddings=True)[0]
    scores = vectors @ asked                              # cosine similarity with every passage
    return [passages[i] for i in np.argsort(-scores)[:keep]]

def answer(question):
    found = retrieve(question)
    prompt = "Answer using only these passages. If the answer is not there, say so.\\n\\n"
    prompt += "\\n".join(f"[{n + 1}] {p}" for n, p in enumerate(found))
    prompt += f"\\n\\nQuestion: {question}"
    return llm(prompt)                                    # the model's knobs never change`,
});

drawAll();
redrawOnResize([chart], drawCurve);
initLabPage();
