/**
 * Behaviour every lesson page shares: the two comprehension checks, completion, the lesson
 * sequence strip and the theme toggle. A lesson is complete when every check on the page has
 * been answered correctly; nothing needs to be clicked to "mark as done".
 */

import { calmLiveRegions } from "./announce";
import {
  COURSE_LESSONS,
  lessonForHref,
  markLastLocation,
  markLessonComplete,
  readProgress,
  recordQuizOutcome,
} from "./progress";
import { initTheme } from "./theme";

function quizStorageKey(index: number): string {
  return `ml101:quiz:${document.body.dataset.lesson ?? location.pathname}:${index}`;
}

function readStoredAnswer(index: number): number | undefined {
  try {
    const stored = localStorage.getItem(quizStorageKey(index));
    return stored === null ? undefined : Number(stored);
  } catch {
    return undefined;
  }
}

function storeAnswer(index: number, choice: number): void {
  try {
    localStorage.setItem(quizStorageKey(index), String(choice));
  } catch {
    // Storage can be unavailable in private windows; the check still works.
  }
}

function renderSequence(): void {
  const progress = readProgress();
  const current = location.pathname.split("/").at(-1) || "index.html";
  document.querySelectorAll<HTMLAnchorElement>(".lesson-progress a").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (href === current) link.setAttribute("aria-current", "page");
    const lesson = lessonForHref(href);
    const isComplete = lesson !== undefined && progress.completedLessonIds.has(lesson.id);
    link.classList.toggle("is-complete", isComplete);
    if (isComplete) link.setAttribute("aria-label", `${link.textContent?.trim()}, completed`);
  });
}

function renderLessonProgress(): void {
  const lessonId = document.body.dataset.lesson;
  if (!lessonId) return;
  const quizzes = [...document.querySelectorAll<HTMLElement>(".quiz")];
  const correct = quizzes.filter(
    (quiz) =>
      quiz.querySelector<HTMLButtonElement>('.quiz-options button[aria-pressed="true"]')?.dataset
        .correct === "true",
  ).length;
  let progress = readProgress();
  if (
    quizzes.length > 0 &&
    correct === quizzes.length &&
    !progress.completedLessonIds.has(lessonId)
  ) {
    markLessonComplete(lessonId);
    progress = readProgress();
  }
  renderSequence();

  const checkSection = quizzes[0]?.parentElement;
  if (!checkSection) return;
  let status = checkSection.querySelector<HTMLElement>(".lesson-completion");
  if (!status) {
    status = document.createElement("p");
    status.className = "lesson-completion";
    status.setAttribute("aria-live", "polite");
    checkSection.append(status);
  }
  const isComplete = progress.completedLessonIds.has(lessonId);
  status.classList.toggle("complete", isComplete);
  status.textContent = isComplete
    ? "Lesson complete. Your progress is saved on this device."
    : `${correct} of ${quizzes.length} checks correct. Get both right to finish this lesson.`;
}

function initQuizzes(): void {
  document.querySelectorAll<HTMLElement>(".quiz").forEach((quiz, quizIndex) => {
    const feedback = quiz.querySelector<HTMLElement>(".quiz-feedback");
    const options = [...quiz.querySelectorAll<HTMLButtonElement>(".quiz-options button")];
    const select = (button: HTMLButtonElement, remembered: boolean) => {
      options.forEach((option) => {
        option.classList.remove("correct", "incorrect");
        option.removeAttribute("aria-pressed");
      });
      const correct = button.dataset.correct === "true";
      button.classList.add(correct ? "correct" : "incorrect");
      button.setAttribute("aria-pressed", "true");
      if (feedback) {
        const written =
          button.dataset.feedback ?? (correct ? "Correct." : "Try the chart, then choose again.");
        // A wrong choice is shown in red; say so in words too.
        const message = correct || /^not quite/i.test(written) ? written : `Not quite. ${written}`;
        feedback.textContent = remembered ? `${message} (Your earlier answer.)` : message;
      }
      const lessonId = document.body.dataset.lesson;
      if (lessonId) recordQuizOutcome(lessonId, quizIndex, correct);
      renderLessonProgress();
    };
    options.forEach((button, choice) => {
      button.addEventListener("click", () => {
        select(button, false);
        storeAnswer(quizIndex, choice);
      });
    });
    const stored = readStoredAnswer(quizIndex);
    if (stored !== undefined && options[stored]) select(options[stored], true);
  });
  renderLessonProgress();
}

function rememberCurrentLesson(): void {
  const lesson = COURSE_LESSONS.find((entry) => entry.id === document.body.dataset.lesson);
  if (!lesson) return;
  markLastLocation({
    kind: "lesson",
    href: location.pathname,
    label: lesson.title,
    lessonId: lesson.id,
  });
}

/**
 * A lesson slider's label reads "Learning rate · 0.020". Name the slider by the words alone and
 * speak the shown value, which is in real units, not the slider's raw position (the learning
 * rate slider runs on a log scale from −3 to −0.45).
 */
function nameSliders(): void {
  document.querySelectorAll<HTMLInputElement>('.control input[type="range"]').forEach((input) => {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
    const shown = label?.querySelector("span");
    if (!label || !shown) return;
    const name = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/[·\s]+$/u, "")
      .trim();
    if (name) input.setAttribute("aria-label", name);
    const speak = () => input.setAttribute("aria-valuetext", shown.textContent?.trim() ?? "");
    input.addEventListener("input", () => window.setTimeout(speak, 0));
    speak();
  });
}

/** Call once from a lesson's entry module, after its widget is wired. */
export function initLessonPage(): void {
  initTheme();
  nameSliders();
  calmLiveRegions();
  initQuizzes();
  rememberCurrentLesson();
}
