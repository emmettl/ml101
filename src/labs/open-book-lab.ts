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
} from "../retrieval/engine";
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

interface Params extends Record<string, number | string> {
  question: string;
  size: number;
  overlap: number;
  keep: number;
}

const defaults: Params = { question: "bottle", size: 60, overlap: 0, keep: 3 };
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
/** A question typed by the learner. It has no answer key. */
let custom = "";
let frame = 0;

const isBook = (at: number): boolean => QUESTIONS[at].wording === "book";
const isOwn = (at: number): boolean => !isBook(at);
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

function rebuild(): void {
  index = buildIndex(words, chunkWords(words, params.size, params.overlap));
  exam = sitExam(index, text, QUESTIONS, DEEPEST);
}

function drawSearch(): void {
  const question = QUESTIONS.find((entry) => entry.id === params.question) ?? QUESTIONS[0];
  const asked = custom || question.ask;
  const span = custom ? undefined : locate(text, question);
  const matches = retrieve(index, asked, params.keep);
  byId("book-asked").textContent = asked;
  renderPassages(byId("book-passages"), text, words, index, matches, span);
  byId("book-prompt").textContent = promptFor(text, index, matches, asked);

  const handed = matches.reduce(
    (total, match) => total + index.chunks[match.chunk].to - index.chunks[match.chunk].from,
    0,
  );
  byId("book-prompt-caption").textContent =
    `What the model receives: ${handed.toLocaleString("en-GB")} words of the book (clipped here for display), and your question`;

  const unknown = unknownWords(index, asked);
  const blind =
    unknown.length === 0
      ? ""
      : ` The book never uses ${list(unknown)}, so ${unknown.length === 1 ? "that word" : "those words"} matched nothing and the search ran on what was left. A learned embedding, trained on far more than one book, would know what ${unknown.length === 1 ? "it means" : "they mean"}; word weights cannot.`;
  const outcome = byId("book-outcome");
  if (custom) {
    outcome.textContent = `This is your own question, so there is no answer key to check against. Read the ${plural(matches.length, "passage")} and judge: would a careful reader be able to answer from these alone?${blind}`;
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
  byId("book-description").textContent =
    `${all} of ${QUESTIONS.length} answers reach the model: ${book} of the ${BOOK} asked in the book's words and ${own} of the ${OWN} asked in a reader's. ` +
    (cut > 0
      ? `${plural(cut, "answer")} cannot be found at any depth, because a passage boundary runs through the sentence. `
      : "") +
    (share >= 10
      ? `Each question now carries ${share.toFixed(0)}% of the whole book along with it. The answer is in there, and so is a great deal that is not the answer; the model has to find it, and you pay for every word.`
      : own < book - 2
        ? "The gap between the two kinds of question is the gap between matching words and matching meaning."
        : "");
  byId("book-simulation-status").textContent =
    `Current · ${index.chunks.length.toLocaleString("en-GB")} passages of ${params.size} words · ${params.overlap === 0 ? "no overlap" : `${params.overlap * 100}% overlap`} · ${plural(params.keep, "passage")} handed over · ${QUESTIONS.length} questions with known answers`;
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

const panel = renderControls(byId("book-controls"), "book", controls, params, (key) => {
  if (key === "size" || key === "overlap") rebuild();
  if (key === "question") {
    custom = "";
    ownInput.value = "";
  }
  schedule();
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
  rebuild();
  schedule();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole of retrieval: embed the question, score every passage, keep the best",
  source,
  marker: "retrieve",
  pythonCaption: "The same pipeline with a learned embedding and a real model",
  python: `from sentence_transformers import SentenceTransformer
import numpy as np

embedder = SentenceTransformer("all-MiniLM-L6-v2")     # a learned embedding (lesson 05)

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
