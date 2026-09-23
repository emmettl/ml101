/**
 * A lab's settings as a link. The hash of the URL carries `control-id=value` pairs, so that a
 * particular setup can be shared, bookmarked, or offered as a suggestion on the page itself.
 * Only the inputs the lab renders as controls take part; nothing is stored anywhere else.
 */

export type Setup = Record<string, string>;

const CONTROLS = ".controls select, .controls input[type='range']";

/** `#drift-scenario=sudden&drift-labelDelay=6` → { "drift-scenario": "sudden", … }. */
export function parseSetup(hash: string): Setup {
  const setup: Setup = {};
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, "")))
    if (/^[a-z]+-[A-Za-z]+$/.test(key)) setup[key] = value;
  return setup;
}

export function serialiseSetup(setup: Setup): string {
  const pairs = new URLSearchParams();
  for (const [key, value] of Object.entries(setup)) pairs.set(key, value);
  const text = pairs.toString();
  return text ? `#${text}` : "";
}

/** The current value of every control on the page. */
export function readSetup(): Setup {
  const setup: Setup = {};
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(CONTROLS))
    if (input.id) setup[input.id] = input.value;
  return setup;
}

/** Push values into the controls and let each lab react exactly as if a person had moved them. */
export function applySetup(setup: Setup): number {
  let applied = 0;
  for (const [id, value] of Object.entries(setup)) {
    const input = document.getElementById(id);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) continue;
    if (!input.closest(".controls") || input.value === value) continue;
    input.value = value;
    if (input.value !== value) continue;
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
    applied += 1;
  }
  return applied;
}

/** Keep the address bar in step without adding history entries or scrolling. */
export function showSetupInUrl(setup: Setup | null): void {
  const hash = setup ? serialiseSetup(setup) : "";
  history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
}

/** A button that puts the current settings in the address bar and on the clipboard. */
export function shareButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "share-button";
  button.textContent = "Share these settings";
  let timer = 0;
  button.addEventListener("click", () => {
    showSetupInUrl(readSetup());
    const said = (text: string) => {
      button.textContent = text;
      clearTimeout(timer);
      timer = window.setTimeout(() => (button.textContent = "Share these settings"), 2500);
    };
    navigator.clipboard
      ?.writeText(location.href)
      .then(() => said("Link copied"))
      .catch(() => said("Link is in the address bar"));
  });
  return button;
}

/** Read the hash on arrival and whenever it changes; clear it on Reset. */
export function initSetupLinks(): void {
  const apply = () => applySetup(parseSetup(location.hash));
  apply();
  window.addEventListener("hashchange", apply);
  document.querySelector(".reset-button")?.addEventListener("click", () => showSetupInUrl(null));
}
