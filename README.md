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

| # | Lesson | Lab | Status |
| --- | --- | --- | --- |
| 00 | A machine with knobs | Line Fitter | live |
| 01 | Rolling downhill | Descent Lab | live |
| 02 | Too clever by half | Overfitting Lab | live |
| 03 | From numbers to decisions | Neuron Lab | in preparation |
| 04 | Stacking neurons | Network Playground | in preparation |
| 05 | Text becomes numbers | Token & Embedding Lab | in preparation |
| 06 | Attention | Attention Lab | in preparation |
| 07 | Predict the next token | Next-Token Lab | in preparation |
| 08 | From toy to ChatGPT | Scale Ladder | in preparation |

A prose-first deep-dive guide (training / validation / test, parameter / hyperparameter) and a self-grading capstone (“Ship a model you'd trust”) follow the lessons.

## Website

Every push to `main` builds and publishes the multi-page site through GitHub Pages; pull requests run the same checks without publishing. `index.html` is the course home, the `lesson-*.html` pages are the primary readings, `labs.html` is the lab hub and `glossary.html` is the searchable reference.

Run `npm install` once. Use `npm run dev` for local development and `npm run build` for a type-checked production bundle plus the complete site. `npm run check` verifies Oxfmt and Prettier formatting, runs Oxlint and Stylelint, checks TypeScript and executes the engine tests. `npm run test:e2e` runs a smoke sweep of every page (load, nudge the first controls, no runtime errors, no broken numbers, no horizontal overflow at phone width) plus focused checks of lesson completion, prediction grading, themes, descent, keyboard chart control and the code peek. It needs a browser: either `npx playwright install chromium`, or set `PW_CHANNEL=chrome` to use an installed Chrome (`PW_CHANNEL=chrome npm run test:e2e -- --workers=2`). `npm run check:all` runs every check and the production build. Use `npm run format` and `npm run lint:fix` for automatic cleanup.

## Source layout

- `src/fit/` is the straight-line engine: data, loss, the loss landscape, exact best fits, gradients, gradient descent and the largest safe learning rate. It drives lessons 00–01, the Line Fitter and the Descent Lab.
- `src/overfit/` is the curve-fitting engine: Chebyshev features, a Cholesky least-squares solve with a wiggliness penalty, held-out scoring and the degree sweep. It drives lesson 02 and the Overfitting Lab.
- `src/lessons/` holds one small entry module per lesson widget, plus the glossary filter. `src/labs/` holds one controller per lab. Lessons and labs import the same engines, so a lesson chart and its lab cannot drift apart.
- `src/progress/` renders learner progress on the home page.
- `src/shared/` contains everything reusable:
  - `plot.ts` (responsive SVG plots coloured entirely by CSS classes), `heat.ts` (a canvas heatmap layered behind a plot), `drag.ts` (draggable, keyboard-movable points that survive redraws), `transport.ts` (play / pause / step for anything that learns over time; pauses when hidden, honours reduced motion), `controls.ts` (declarative lab controls and stat tiles), `codepeek.ts`
  - `theme.ts` and `tokens.ts`: themes live on `<html data-theme>`; `tokens.css` is the single source of colour and TypeScript reads it only for canvas drawing
  - `predict.ts`, `predict-prompts.ts`, `predict-mount.ts`: the predict-then-reveal module; prompts are keyed by page file name
  - `progress.ts`, `lesson.ts`, `lab.ts`: progress storage (versioned, and harmless when storage is unavailable), lesson checks and completion, and shared lab setup
  - `svg-interaction.ts`, `chart-size.ts`, `collapsible.ts`, `random.ts`: chart inspection with full keyboard support, phone-legible chart sizing, phone-only accordions, and seeded randomness so every chart and test repeats exactly
- `partials/` holds the shared page chrome. `<!-- include: name key="value" -->` in a page is replaced at build time (see `vite.config.ts`), so the head, navigation and footers are written once.

### Adding a page

Create `name.html` in the repository root; every root HTML file is discovered automatically as a Vite entry and by the smoke test. Start it with `<!-- include: head -->`. Keep the rules of the model in a strict TypeScript engine module with no browser globals, where they can be unit-tested, and keep DOM work in the page's entry module. Mark the part of the engine worth showing with `// peek:start name` … `// peek:end`. Give the lab a status line whose id ends in `simulation-status` and that reads “Current …” once settled: the predict module and the smoke test both wait on it. Add the lab's prompts to `src/shared/predict-prompts.ts`, and a new lesson to `COURSE_LESSONS` in `src/shared/progress.ts` and to `partials/lesson-sequence.html`.

## Important note

This material is educational. The models are deliberately tiny and illustrative: they show how the mechanism works, not how production systems are built, tuned or evaluated. All data is synthetic.

The project is institution-neutral: examples are synthetic or drawn from public sources, and no private or organisation-specific material belongs in the repository.
