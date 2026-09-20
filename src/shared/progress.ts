export interface CourseLesson {
  id: string;
  number: string;
  title: string;
  href: string;
}

export interface ProgressLocation {
  kind: "lesson" | "lab";
  href: string;
  label: string;
  lessonId?: string;
}

export interface ProgressSnapshot {
  completedLessonIds: Set<string>;
  correctQuizCount: number;
  predictionAttemptCount: number;
  predictionCorrectCount: number;
  lastLocation?: ProgressLocation;
  hasActivity: boolean;
}

export interface ContinueTarget {
  href: string;
  label: string;
}

interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  setItem(key: string, value: string): void;
}

/** Lessons that exist today, in reading order. */
export const COURSE_LESSONS: readonly CourseLesson[] = [
  { id: "knobs", number: "00", title: "A machine with knobs", href: "lesson-00-knobs.html" },
  { id: "descent", number: "01", title: "Rolling downhill", href: "lesson-01-descent.html" },
  {
    id: "overfitting",
    number: "02",
    title: "Too clever by half",
    href: "lesson-02-overfitting.html",
  },
  {
    id: "decisions",
    number: "03",
    title: "From numbers to decisions",
    href: "lesson-03-decisions.html",
  },
  { id: "networks", number: "04", title: "Stacking neurons", href: "lesson-04-networks.html" },
  { id: "text", number: "05", title: "Text becomes numbers", href: "lesson-05-text.html" },
  { id: "attention", number: "06", title: "Attention", href: "lesson-06-attention.html" },
  {
    id: "next-token",
    number: "07",
    title: "Predict the next token",
    href: "lesson-07-next-token.html",
  },
];

/** Lessons still being written; shown on the home page so the route ahead is visible. */
export const PLANNED_LESSONS: readonly Pick<CourseLesson, "number" | "title">[] = [
  { number: "08", title: "From toy to ChatGPT" },
];

const LESSON_COMPLETE_PREFIX = "ml101:progress:lesson:";
const QUIZ_OUTCOME_PREFIX = "ml101:progress:quiz:";
const PREDICTION_PREFIX = "ml101:predict:";
const LAST_LOCATION_KEY = "ml101:progress:last-location";
const SCHEMA_KEY = "ml101:progress:schema";
/** Bump when stored values change meaning; older data is then ignored rather than misread. */
export const SCHEMA_VERSION = "1";
export const PROGRESS_EVENT = "ml101:progress";

function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function store(key: string, value: string, storage = browserStorage()): void {
  try {
    storage?.setItem(SCHEMA_KEY, SCHEMA_VERSION);
    storage?.setItem(key, value);
  } catch {
    // Progress is an enhancement; the course remains usable when storage is unavailable.
  }
}

function emitProgressChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_EVENT));
}

export function lessonCompletionKey(id: string): string {
  return `${LESSON_COMPLETE_PREFIX}${id}`;
}

export function quizOutcomeKey(lessonId: string, index: number): string {
  return `${QUIZ_OUTCOME_PREFIX}${lessonId}:${index}`;
}

export function recordQuizOutcome(lessonId: string, index: number, correct: boolean): void {
  const key = quizOutcomeKey(lessonId, index);
  const storage = browserStorage();
  if (!storage) return;
  let outcome = correct ? "right" : "wrong";
  try {
    if (storage.getItem(key) === "right") outcome = "right";
  } catch {
    // Use the current outcome when the prior value cannot be read.
  }
  store(key, outcome, storage);
  emitProgressChange();
}

export function markLessonComplete(lessonId: string): void {
  store(lessonCompletionKey(lessonId), "complete");
  emitProgressChange();
}

export function markLastLocation(location: ProgressLocation): void {
  store(LAST_LOCATION_KEY, JSON.stringify(location));
  emitProgressChange();
}

function parseLastLocation(raw: string | null): ProgressLocation | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<ProgressLocation>;
    if (
      (value.kind === "lesson" || value.kind === "lab") &&
      typeof value.href === "string" &&
      typeof value.label === "string"
    ) {
      return {
        kind: value.kind,
        href: value.href,
        label: value.label,
        lessonId: typeof value.lessonId === "string" ? value.lessonId : undefined,
      };
    }
  } catch {
    // Ignore data from an older or interrupted write.
  }
  return undefined;
}

export function readProgress(storage = browserStorage()): ProgressSnapshot {
  const completedLessonIds = new Set<string>();
  let correctQuizCount = 0;
  let predictionAttemptCount = 0;
  let predictionCorrectCount = 0;
  let lastLocation: ProgressLocation | undefined;

  if (storage) {
    try {
      const schema = storage.getItem(SCHEMA_KEY);
      if (schema !== null && schema !== SCHEMA_VERSION) storage = undefined;
    } catch {
      storage = undefined;
    }
  }

  if (storage) {
    try {
      for (const lesson of COURSE_LESSONS) {
        if (storage.getItem(lessonCompletionKey(lesson.id)) === "complete") {
          completedLessonIds.add(lesson.id);
        }
      }
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        const value = storage.getItem(key);
        if (key.startsWith(QUIZ_OUTCOME_PREFIX) && value === "right") correctQuizCount += 1;
        if (key.startsWith(PREDICTION_PREFIX) && (value === "right" || value === "wrong")) {
          predictionAttemptCount += 1;
          if (value === "right") predictionCorrectCount += 1;
        }
      }
      lastLocation = parseLastLocation(storage.getItem(LAST_LOCATION_KEY));
    } catch {
      // Return whatever could be read before storage became unavailable.
    }
  }

  return {
    completedLessonIds,
    correctQuizCount,
    predictionAttemptCount,
    predictionCorrectCount,
    lastLocation,
    hasActivity:
      completedLessonIds.size > 0 ||
      correctQuizCount > 0 ||
      predictionAttemptCount > 0 ||
      lastLocation !== undefined,
  };
}

export function continueTarget(progress: ProgressSnapshot): ContinueTarget {
  const { lastLocation } = progress;
  if (lastLocation?.kind === "lab") {
    return { href: lastLocation.href, label: `Continue ${lastLocation.label}` };
  }

  if (lastLocation?.kind === "lesson" && lastLocation.lessonId) {
    const currentIndex = COURSE_LESSONS.findIndex((lesson) => lesson.id === lastLocation.lessonId);
    if (!progress.completedLessonIds.has(lastLocation.lessonId)) {
      return { href: lastLocation.href, label: `Continue lesson ${lastLocation.label}` };
    }
    const nextLesson = COURSE_LESSONS.slice(currentIndex + 1).find(
      (lesson) => !progress.completedLessonIds.has(lesson.id),
    );
    if (nextLesson) {
      return { href: nextLesson.href, label: `Continue with ${nextLesson.title}` };
    }
  }

  const firstIncomplete = COURSE_LESSONS.find(
    (lesson) => !progress.completedLessonIds.has(lesson.id),
  );
  if (firstIncomplete) {
    return {
      href: firstIncomplete.href,
      label: progress.hasActivity
        ? `Continue with ${firstIncomplete.title}`
        : "Start with lesson 00",
    };
  }

  const finalLesson = COURSE_LESSONS.at(-1);
  return {
    href: finalLesson?.href ?? "lesson-00-knobs.html",
    label: "Review the course",
  };
}

export function lessonForHref(href: string): CourseLesson | undefined {
  const fileName = href.split("/").at(-1)?.split(/[?#]/)[0];
  return COURSE_LESSONS.find((lesson) => lesson.href === fileName);
}
