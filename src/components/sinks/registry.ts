import type { Component } from "vue";
import CentralDbPanel from "@/components/sinks/CentralDbPanel.vue";
import RecordsPanel from "@/components/sinks/RecordsPanel.vue";

/**
 * UI panel per sink kind. A scraper's flavor descriptor declares its sinks; each one whose kind has
 * a panel here becomes a tab. A kind without a panel gets a disabled tab saying so.
 */
export const SINK_PANELS: Record<string, Component> = {
  CENTRAL_DB: CentralDbPanel,
  RECORDS: RecordsPanel,
};
