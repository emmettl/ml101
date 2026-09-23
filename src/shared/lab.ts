/** Behaviour every lab page shares: theme, the stacked-layout accordion, the phone dock, “Try this” and shareable settings. */

import { calmLiveRegions, labelTables } from "./announce";
import { mountCoach } from "./coach";
import { initCollapsibleSections } from "./collapsible";
import { initControlDock } from "./dock";
import { initSetupLinks } from "./setup";
import { initTheme } from "./theme";

export const STACKED_QUERY = "(max-width: 1000px)";

export function initLabPage(): void {
  initTheme();
  initCollapsibleSections(STACKED_QUERY);
  initControlDock();
  calmLiveRegions();
  labelTables();
  mountCoach();
  initSetupLinks();
}
