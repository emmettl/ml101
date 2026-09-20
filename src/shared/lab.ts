/** Behaviour every lab page shares: theme toggle and the phone-width accordion for controls. */

import { initCollapsibleSections } from "./collapsible";
import { initTheme } from "./theme";

export const STACKED_QUERY = "(max-width: 1000px)";

export function initLabPage(): void {
  initTheme();
  initCollapsibleSections(STACKED_QUERY);
}
