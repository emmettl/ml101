import {
  HAVE,
  MISSING,
  OUTPUTS,
  PRICES,
  PROMPTS,
  VOLUMES,
  bill,
  recommend,
  type Have,
  type Missing,
} from "../guide/using";
import { byId } from "../shared/controls";
import { initTheme } from "../shared/theme";

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

const WAY_NAMES = {
  prompt: "Prompt",
  retrieve: "Retrieve",
  "fine-tune": "Fine-tune",
  train: "Train",
};
let missing: Missing = "knowledge";
let have: Have = "nothing";

function showVerdict(): void {
  const verdict = recommend(missing, have);
  byId("use-way").textContent = WAY_NAMES[verdict.way];
  byId("use-title").textContent = verdict.title;
  byId("use-why").textContent = verdict.why;
  byId("use-changes").textContent = verdict.changes;
  byId("use-limit").textContent = verdict.limit;
  byId("use-first").textContent = verdict.first;
}

let volume = "product";
let prompt = "short";
let output = "paragraph";
let price = "large";

const money = (value: number): string =>
  value >= 1000
    ? `$${Math.round(value).toLocaleString("en-GB")}`
    : value >= 1
      ? `$${value.toFixed(2)}`
      : `$${value.toFixed(4)}`;

function showBill(): void {
  const usage = {
    requestsPerDay: VOLUMES[volume].requests,
    inputTokens: PROMPTS[prompt].tokens,
    outputTokens: OUTPUTS[output].tokens,
    priceIn: PRICES[price].priceIn,
    priceOut: PRICES[price].priceOut,
  };
  const result = bill(usage);
  byId("use-cost-label").textContent =
    result.perMonth < 100
      ? "Pocket money"
      : result.perMonth < 10_000
        ? "A line in the budget"
        : "A serious bill";
  byId("use-cost-title").textContent = `${money(result.perMonth)} a month`;
  byId("use-cost-tokens").textContent = result.tokensPerRequest.toLocaleString("en-GB");
  byId("use-cost-request").textContent = money(result.perRequest);
  byId("use-cost-input").textContent = `${Math.round(result.inputShare * 100)}%`;
  byId("use-cost-note").textContent =
    prompt === "long"
      ? `Pasting a whole document into every request is the expensive habit: ${Math.round(result.inputShare * 100)}% of this bill is input tokens, most of them the same document sent again and again. Retrieval hands over the three passages that matter for about a twentieth of the tokens.`
      : prompt === "examples"
        ? `The examples that steer the manner are sent with every request. At this volume that is ${money(bill({ ...usage, inputTokens: PROMPTS.short.tokens }).perMonth)} a month without them: fine-tuning moves the manner into the knobs and drops the examples from the prompt, which is worth doing once the difference pays for the retraining.`
        : output === "page"
          ? `Output tokens cost several times input tokens, and a page of them per request dominates this bill. Asking for a shorter answer is the cheapest change there is.`
          : `Prices fall and models change; the arithmetic does not: requests, times tokens, times price. Output tokens cost several times input ones, so here a ${OUTPUTS[output].tokens}-token answer outweighs a ${PROMPTS[prompt].tokens}-token prompt; add examples or passages to the prompt and the balance swings the other way.`;
}

choiceSet(
  byId("use-missing"),
  (Object.keys(MISSING) as Missing[]).map((id) => ({ id, label: MISSING[id] })),
  missing,
  (id) => {
    missing = id;
    showVerdict();
  },
);
choiceSet(
  byId("use-have"),
  (Object.keys(HAVE) as Have[]).map((id) => ({ id, label: HAVE[id] })),
  have,
  (id) => {
    have = id;
    showVerdict();
  },
);
choiceSet(
  byId("use-volume"),
  Object.entries(VOLUMES).map(([id, entry]) => ({ id, label: entry.label })),
  volume,
  (id) => {
    volume = id;
    showBill();
  },
);
choiceSet(
  byId("use-prompt"),
  Object.entries(PROMPTS).map(([id, entry]) => ({ id, label: entry.label })),
  prompt,
  (id) => {
    prompt = id;
    showBill();
  },
);
choiceSet(
  byId("use-output"),
  Object.entries(OUTPUTS).map(([id, entry]) => ({ id, label: entry.label })),
  output,
  (id) => {
    output = id;
    showBill();
  },
);
choiceSet(
  byId("use-price"),
  Object.entries(PRICES).map(([id, entry]) => ({ id, label: entry.label })),
  price,
  (id) => {
    price = id;
    showBill();
  },
);

showVerdict();
showBill();
initTheme();
