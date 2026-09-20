import { describe, expect, it } from "vitest";

import {
  COURSE_LESSONS,
  continueTarget,
  lessonCompletionKey,
  quizOutcomeKey,
  readProgress,
} from "./progress";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("storage is unavailable");
  }
}

describe("learner progress", () => {
  it("summarises completed lessons, mastered checks and predictions", () => {
    const storage = new MemoryStorage();
    storage.setItem(lessonCompletionKey("knobs"), "complete");
    storage.setItem(quizOutcomeKey("knobs", 0), "right");
    storage.setItem(quizOutcomeKey("knobs", 1), "right");
    storage.setItem("ml101:predict:/descent-lab.html:rate-up", "right");
    storage.setItem("ml101:predict:/overfitting-lab.html:degree-up", "wrong");

    const progress = readProgress(storage);

    expect(progress.completedLessonIds).toEqual(new Set(["knobs"]));
    expect(progress.correctQuizCount).toBe(2);
    expect(progress.predictionAttemptCount).toBe(2);
    expect(progress.predictionCorrectCount).toBe(1);
    expect(progress.hasActivity).toBe(true);
  });

  it("advances a completed lesson to the next unfinished lesson", () => {
    const storage = new MemoryStorage();
    storage.setItem(lessonCompletionKey("knobs"), "complete");
    storage.setItem(
      "ml101:progress:last-location",
      JSON.stringify({
        kind: "lesson",
        href: "/lesson-00-knobs.html",
        label: "A machine with knobs",
        lessonId: "knobs",
      }),
    );

    expect(continueTarget(readProgress(storage))).toEqual({
      href: COURSE_LESSONS[1].href,
      label: "Continue with Rolling downhill",
    });
  });

  it("returns to the latest prediction lab", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "ml101:progress:last-location",
      JSON.stringify({ kind: "lab", href: "/descent-lab.html", label: "Descent Lab" }),
    );

    expect(continueTarget(readProgress(storage))).toEqual({
      href: "/descent-lab.html",
      label: "Continue Descent Lab",
    });
  });

  it("ignores data written under a different schema", () => {
    const storage = new MemoryStorage();
    storage.setItem("ml101:progress:schema", "0");
    storage.setItem(lessonCompletionKey("knobs"), "complete");

    const progress = readProgress(storage);

    expect(progress.completedLessonIds.size).toBe(0);
    expect(progress.hasActivity).toBe(false);
  });

  it("reports no activity, without throwing, when storage fails", () => {
    const progress = readProgress(new BrokenStorage());

    expect(progress.hasActivity).toBe(false);
    expect(continueTarget(progress).href).toBe(COURSE_LESSONS[0].href);
  });
});
