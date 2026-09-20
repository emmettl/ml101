/** Behaviour every lab page shares: theme toggle, the stacked-layout accordion and the phone dock. */

import { calmLiveRegions, labelTables } from "./announce";
import { initCollapsibleSections } from "./collapsible";
import { initControlDock } from "./dock";
import { initTheme } from "./theme";

export const STACKED_QUERY = "(max-width: 1000px)";

export function initLabPage(): void {
  initTheme();
  initCollapsibleSections(STACKED_QUERY);
  initControlDock();
  calmLiveRegions();
  labelTables();
}
