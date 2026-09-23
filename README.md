# ML 101

An independent short course that builds a working intuition for how modern machine learning works, from fitting a straight line to language models. It is written for developers who do not train models for a living, and is meant to be readable by anyone. No maths beyond a straight line is assumed.

One idea runs through every page: **a model is a machine with knobs, and learning is turning the knobs to shrink the error.**

It is a sibling of [Derivatives 101](https://github.com/emmettl/derivatives101) and shares its shape, tooling and conventions.

## Course contents

- Web-native lessons, each a ten-minute reading with one engine-driven experiment, two comprehension checks whose every option carries a diagnosis, and four takeaways
- One interactive lab per lesson: a tiny real model running live, with a scope note saying what it models and what it leaves out, a generated plain-English readout of the current result, and a full evidence table
- Predict-then-reveal prompts on every lab: the learner commits to a prediction, the lab applies the change and grades the prediction against its own live numbers. Several are deliberate traps
- A collapsed “Show me the code” panel on every lab, showing the engine's real source beside a NumPy equivalent
- Device-local learner progress that marks completed lessons, counts correct checks and predictions, and resumes at the latest activity or next unfinished lesson
- A searchable glossary in which the jargon always arrives after the idea
- Light and dark themes, and layouts that work at phone width
- Built to be usable with a keyboard and a screen reader: one `<main>` per page holding its heading, skip links, sliders that speak their value in real units, charts that are a single tab stop however many draggable points they hold, readouts announced once they settle instead of on every movement, and right/wrong said in words as well as colour

| # | Lesson | Lab | Status |
| --- | --- | --- | --- |
| 00 | A machine with knobs | Line Fitter | live |
| 01 | Rolling downhill | Descent Lab | live |
| 02 | Too clever by half | Overfitting Lab | live |
| 03 | From numbers to decisions | Neuron Lab | live |
| 04 | Stacking neurons | Network Playground | live |
| 05 | Text becomes numbers | Token & Embedding Lab | live |
| 06 | Attention | Attention Lab | live |
| 07 | Predict the next token | Next-Token Lab | live |
| 08 | From toy to ChatGPT | Scale Ladder | live |
| 09 | Open-book answers | Open-Book Lab | live |
| 10 | Questions instead of knobs | Trees Lab | live |
| 11 | Groups nobody labelled | Cluster Lab | live |
| 12 | The same knobs everywhere | Vision Lab | live |
| 13 | Learning from consequences | Reward Lab | live |
| 14 | Drawing by removing noise | Diffusion Lab | live |

Lesson 07 has a second lab, **Table vs Network**, which bridges to lesson 08: the count table and a small neural language model, trained in a Web Worker, scored side by side on held-out text.

The **Fairness Lab** (Lab 12, linked from lessons 03, 05 and 08) trains lesson 03's neuron on invented lending decisions made by prejudiced staff. It shows the prejudice learned as a weight, surviving deletion of the group column through a proxy, and invisible to any score computed against the same labels; then that equal approval rates, equal chances for those who qualify and equally meaningful approvals cannot all hold once groups differ. A last panel measures which way 36 job words lean along the he/she direction in the shipped GloVe vectors. `src/fairness/` holds the engine, the lean measurement and tests pinning every claim.

The **Drift Lab** (Lab 13, linked from lesson 08) trains the same neuron on six months of invented churn data and runs it for thirty more while the customers change, or the reason they cancel changes, slowly or overnight. It shows that an input monitor rings in the harmless case and stays silent in the harmful one, that labels arrive late, and that a retrain can learn a world that has already ended. `src/drift/` holds the engine and tests.

Lesson 09 turns from how models are built to how they are used. Its **Open-Book Lab** does the retrieval half of retrieval-augmented generation for real (passages, TF-IDF vectors, cosine ranking, the assembled prompt) and scores it on 24 questions with known answers, half asked in the book's words and half in a reader's. There is no language model on the page, and the lab says so. Two optional search methods use learned word vectors: `src/data/glove.bin` and `glove-words.txt` are an 11,874-word, one-byte-per-number subset of GloVe 6B 50d (Pennington, Socher and Manning, 2014; Public Domain Dedication and License), built by `scripts/make-glove.mjs` and fetched only when chosen. Measured on the lab's questions they do not beat word matching, and the lab reports that. Two more methods use a real passage encoder, multi-qa-MiniLM-L6-cos-v1 (sentence-transformers, Apache 2.0): `src/data/passages/` holds its vectors, 384 bytes a passage, for each of the lab's 24 passage settings and for the 24 questions (4.3 MB in all, one small file fetched per setting), computed offline by `scripts/make-passage-vectors.mjs`. It clearly beats word matching on paraphrased questions and not on ones that quote the book, so the lab also offers the two rankings merged.

Two further pages follow the lessons. `names-guide.html` is a prose-first deep dive that decodes the confusable names (parameter / hyperparameter; training / validation / test) with two questions, and simulates how peeking at a test set inflates a score. `capstone.html` (“Ship a model you'd trust”) has no answer key: the learner makes five decisions on a synthetic dataset with a planted leak and class imbalance, seven checks are computed from what their model actually does on 4,000 fresh customers, and the result is a model card they can copy.

## Website

Every push to `main` builds and publishes the multi-page site through GitHub Pages; pull requests run the same checks without publishing. `index.html` is the course home, the `lesson-*.html` pages are the primary readings, `labs.html` is the lab hub and `glossary.html` is the searchable reference.

Run `npm install` once. Use `npm run dev` for local development and `npm run build` for a type-checked production bundle plus the complete site. `npm run check` verifies Oxfmt and Prettier formatting, runs Oxlint and Stylelint, checks TypeScript and executes the engine tests. `npm run test:e2e` runs an automated WCAG 2.1 A/AA scan (axe) of every page in both themes, tests of what a screen reader is told (`e2e/a11y.spec.ts`), a smoke sweep of every page (load, nudge the first controls, no runtime errors, no broken numbers, no horizontal overflow at phone width) plus focused checks of lesson completion, prediction grading, themes, descent, keyboard chart control and the code peek. It needs a browser: either `npx playwright install chromium`, or set `PW_CHANNEL=chrome` to use an installed Chrome (`PW_CHANNEL=chrome npm run test:e2e -- --workers=2`). `npm run check:all` runs every check and the production build. Use `npm run format` and `npm run lint:fix` for automatic cleanup.

## Source layout

- `src/fit/` is the straight-line engine: data, loss, the loss landscape, exact best fits, gradients, gradient descent and the largest safe learning rate. It drives lessons 00–01, the Line Fitter and the Descent Lab.
- `src/overfit/` is the curve-fitting engine: Chebyshev features, a Cholesky least-squares solve with a wiggliness penalty, held-out scoring and the degree sweep. It drives lesson 02 and the Overfitting Lab.
- `src/network/` is the classification engine: four two-class puzzles, a single sigmoid neuron, small fully connected networks, cross-entropy, backpropagation (checked against finite differences) and mini-batch training. `view.ts` beside it draws the decision map and wiring diagram. It drives lessons 03–04, the Neuron Lab and the Network Playground.
- `src/language/` holds the text engines: a byte-pair tokeniser (`bpe.ts`), skip-gram word embeddings on an invented mini-language with analogy arithmetic (`embeddings.ts`), hand-set two-dimensional attention (`attention.ts`) and a character n-gram language model with temperature, top-k and a verbatim-copy detector (`ngram.ts`), plus their views. `src/data/alice.txt` is the first seven chapters of *Alice's Adventures in Wonderland* (public domain, distribution boilerplate removed), imported with `?raw`. They drive lessons 05–07 and their labs. `neural.ts` is a Bengio-style character model (embeddings, one hidden layer, softmax) with hand-written backpropagation checked against finite differences, and `counts.ts` is its opponent, a Witten–Bell-smoothed count table; `src/labs/neural-worker.ts` trains the network off the main thread and posts its knobs back as it learns.
- `src/scale/` is the planning arithmetic for lesson 08 and the Scale Ladder: a ladder of model sizes (published figures only), training operations, tokens per parameter, memory and time. Its tests check the course's own model sizes against the engines that build them, and the rule of thumb against GPT-3's published compute.
- `src/capstone/` trains a logistic model the learner's way, scores it the way they chose, then deploys it on fresh leak-free data and derives the readiness checks and model card. `src/guide/` holds the name decoder and the test-set selection-bias simulation.
- `src/lessons/` holds one small entry module per lesson widget, plus the glossary filter. `src/labs/` holds one controller per lab. Lessons and labs import the same engines, so a lesson chart and its lab cannot drift apart.
- `src/progress/` renders learner progress on the home page.
- `src/shared/` contains everything reusable:
  - `plot.ts` (responsive SVG plots coloured entirely by CSS classes), `heat.ts` (a canvas heatmap layered behind a plot), `drag.ts` (draggable, keyboard-movable points that survive redraws), `transport.ts` (play / pause / step for anything that learns over time; pauses when hidden, honours reduced motion), `controls.ts` (declarative lab controls and stat tiles), `codepeek.ts`
  - `theme.ts` and `tokens.ts`: themes live on `<html data-theme>`; `tokens.css` is the single source of colour and TypeScript reads it only for canvas drawing
  - `predict.ts`, `predict-prompts.ts`, `predict-mount.ts`: the predict-then-reveal module; prompts are keyed by page file name
  - `announce.ts`: replaces chatty `aria-live` readouts with a hidden twin that speaks only once the text has stopped changing, and names tables by their panel heading
  - `dock.ts`: at phone width a lab's settings panel is pinned to the bottom of the screen and shows one control at a time, so the chart being changed stays in view (the stacked layout is a flex column, not a grid, because a sticky grid item is confined to its own row)
  - `progress.ts`, `lesson.ts`, `lab.ts`: progress storage (versioned, and harmless when storage is unavailable), lesson checks and completion, and shared lab setup
  - `svg-interaction.ts`, `chart-size.ts`, `collapsible.ts`, `random.ts`: chart inspection with full keyboard support, phone-legible chart sizing, phone-only accordions, and seeded randomness so every chart and test repeats exactly
- `partials/` holds the shared page chrome. `<!-- include: name key="value" -->` in a page is replaced at build time (see `vite.config.ts`), so the head, navigation and footers are written once.

### Adding a page

Create `name.html` in the repository root; every root HTML file is discovered automatically as a Vite entry and by the smoke test. Start it with `<!-- include: head -->`. Keep the rules of the model in a strict TypeScript engine module with no browser globals, where they can be unit-tested, and keep DOM work in the page's entry module. Mark the part of the engine worth showing with `// peek:start name` … `// peek:end`. Charts that hold draggable handles must not be `role="img"` (that hides the handles from assistive technology; `drag.ts` switches them to `group`). Give the lab a status line whose id ends in `simulation-status` and that reads “Current …” once settled: the predict module and the smoke test both wait on it. Add the lab's prompts to `src/shared/predict-prompts.ts`, and a new lesson to `COURSE_LESSONS` in `src/shared/progress.ts` and to `partials/lesson-sequence.html`.

## Important note

This material is educational. The models are deliberately tiny and illustrative: they show how the mechanism works, not how production systems are built, tuned or evaluated. All data is synthetic, apart from one public-domain text.

The project is institution-neutral: examples are synthetic or drawn from public sources, and no private or organisation-specific material belongs in the repository.
