import { ITEMS, TEST_USES, averageInflation, decode, type TestUse } from "../guide/engine";
import { byId } from "../shared/controls";
import { initTheme } from "../shared/theme";

const TEST_SIZE = 200;
const TRUTH = 0.8;

function choiceSet<T extends string>(
  host: HTMLElement,
  options: readonly { id: T; label: string }[],
  initial: T,
  onPick: (id: T) => void,
): void {
  const buttons = options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.dataset.value = option.id;
    button.setAttribute("aria-pressed", String(option.id === initial));
    button.addEventListener("click", () => {
      buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      onPick(option.id);
    });
    return button;
  });
  host.replaceChildren(...buttons);
}

function showItem(id: string): void {
  const item = ITEMS.find((entry) => entry.id === id) ?? ITEMS[0];
  const verdict = decode(item);
  byId("guide-item-kind").textContent = verdict.kind;
  byId("guide-item-name").textContent = `${item.name} is a ${verdict.kind}`;
  byId("guide-item-example").textContent = item.example;
  byId("guide-item-why").textContent = item.why;
  byId("guide-item-set").textContent = verdict.setBy;
  byId("guide-item-judged").textContent = verdict.judgedOn;
  byId("guide-item-never").textContent = verdict.never;
}

const inflationCache = new Map<TestUse, number>();

function showUse(use: TestUse): void {
  const entry = TEST_USES[use];
  let inflation = inflationCache.get(use);
  if (inflation === undefined) {
    inflation = averageInflation(entry.candidates, TEST_SIZE, 200);
    inflationCache.set(use, inflation);
  }
  const points = Math.max(0, inflation * 100);
  byId("guide-use-verdict-label").textContent = entry.verdict.split(".")[0];
  byId("guide-use-title").textContent = entry.label;
  byId("guide-use-verdict").textContent = entry.verdict;
  byId("guide-use-truth").textContent = `${(TRUTH * 100).toFixed(0)}%`;
  byId("guide-use-reported").textContent =
    `${((TRUTH + Math.max(0, inflation)) * 100).toFixed(1)}%`;
  byId("guide-use-inflation").textContent = points < 0.5 ? "none" : `${points.toFixed(1)} points`;
  byId("guide-use-note").textContent =
    entry.candidates === 1
      ? "One look, one number. It may be a little high or a little low, but it is not pushed either way, and that is the property that matters."
      : `Nothing got better. All ${entry.candidates} models are identical in quality by construction, yet the reported figure is ${points.toFixed(1)} points above the truth, and it would vanish on fresh data. A five-point improvement is the kind that gets a paper published or a product shipped. This is why the test set is looked at once.`;
}

choiceSet(
  byId("guide-items"),
  ITEMS.map((item) => ({ id: item.id, label: item.name })),
  ITEMS[0].id,
  showItem,
);
choiceSet(
  byId("guide-uses"),
  (Object.keys(TEST_USES) as TestUse[]).map((id) => ({ id, label: TEST_USES[id].label })),
  "once",
  showUse,
);
showItem(ITEMS[0].id);
showUse("once");
initTheme();
