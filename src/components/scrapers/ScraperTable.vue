<script setup lang="ts">
import { computed, h } from "vue";
import { useRouter } from "vue-router";
import { NDataTable, NButton, NProgress, NTooltip } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import type { Scraper, ScraperStatus } from "@/types";
import { useScrapersStore } from "@/stores/scrapers";
import { useFormatters } from "@/composables/useFormatters";
import { stageTextFor } from "@/composables/useFlavor";

const router = useRouter();
const scrapersStore = useScrapersStore();
const { formatNumber, formatRelativeTime, formatPercent, formatRate } =
  useFormatters();

const emit = defineEmits<{
  (e: "select", scraperId: string): void;
}>();

function statusCssClass(status: ScraperStatus): string {
  const map: Record<string, string> = {
    CONNECTED: "status-tag--active",
    RUNNING: "status-tag--active",
    COMPLETED: "status-tag--active",
    IDLE: "status-tag--idle",
    DISCONNECTED: "status-tag--idle",
    STOPPED: "status-tag--idle",
    PAUSED: "status-tag--warn",
    STOPPING: "status-tag--warn",
    WAITING_APPROVAL: "status-tag--warn",
    ERROR: "status-tag--error",
    VALIDATION_FAILED: "status-tag--error",
    ABORTED: "status-tag--error",
  };
  return map[status] || "status-tag--idle";
}

const columns: DataTableColumns<Scraper> = [
  {
    title: "Scraper",
    key: "name",
    width: 180,
    render: (row) =>
      h(
        "a",
        {
          class: "scraper-link",
          onClick: () => router.push(`/scrapers/${row.scraperId}`),
        },
        row.name || row.scraperId,
      ),
  },
  {
    title: "Type",
    key: "type",
    width: 100,
    render: (row) => h("span", { class: "cell-dim" }, row.type),
  },
  {
    title: "Status",
    key: "status",
    width: 120,
    render: (row) =>
      h("div", { class: "status-tag-container" }, [
        h(
          "span",
          { class: `status-tag ${statusCssClass(row.status)}` },
          row.status,
        ),
      ]),
  },
  {
    title: "Stage",
    key: "currentStage",
    width: 190,
    ellipsis: { tooltip: true },
    render: (row) =>
      h("span", { class: "cell-stage" }, stageTextFor(row, row.currentStage) || "—"),
  },
  {
    title: "Workers",
    key: "workers",
    width: 100,
    render: (row) =>
      h("span", { class: "cell-workers" }, [
        h(
          "span",
          { class: "cell-workers__active" },
          String(row.activeWorkerCount),
        ),
        h("span", { class: "cell-workers__sep" }, " / "),
        h("span", { class: "cell-workers__total" }, String(row.workerCount)),
      ]),
  },
  {
    title: "Progress",
    key: "progress",
    width: 160,
    render: (row) =>
      h(NTooltip, null, {
        trigger: () =>
          h(NProgress, {
            type: "line",
            percentage: row.metrics?.overallProgress || 0,
            showIndicator: false,
            height: 8,
            borderRadius: 4,
            fillBorderRadius: 4,
            status:
              row.status === "ERROR"
                ? "error"
                : row.status === "RUNNING"
                  ? "success"
                  : "default",
          }),
        default: () =>
          `${formatPercent(row.metrics?.overallProgress || 0)} complete`,
      }),
  },
  {
    title: "Processed",
    key: "items",
    width: 130,
    render: (row) =>
      h("span", { class: "cell-items" }, [
        h(
          "span",
          { class: "cell-items__done" },
          formatNumber(row.metrics?.processedItems || 0),
        ),
        h("span", { class: "cell-items__sep" }, " / "),
        h(
          "span",
          { class: "cell-items__total" },
          formatNumber(row.metrics?.totalItems || 0),
        ),
      ]),
  },
  {
    title: "Rate",
    key: "rate",
    width: 80,
    render: (row) =>
      h(
        "span",
        { class: "cell-rate" },
        formatRate(row.metrics?.itemsPerSecond || 0),
      ),
  },
  {
    title: "Last Seen",
    key: "lastHeartbeat",
    width: 100,
    render: (row) =>
      h("span", { class: "cell-dim" }, formatRelativeTime(row.lastHeartbeat)),
  },
  {
    title: "",
    key: "actions",
    width: 80,
    fixed: "right",
    render: (row) =>
      h(
        NButton,
        {
          size: "tiny",
          secondary: true,
          class: "scraper-view-btn",
          onClick: () => emit("select", row.scraperId),
        },
        { default: () => "View" },
      ),
  },
];

const scrapers = computed(() => scrapersStore.scraperList);
</script>

<template>
  <NDataTable
    class="scraper-table"
    :columns="columns"
    :data="scrapers"
    :row-key="(row: Scraper) => row.scraperId"
    :bordered="false"
    :single-line="false"
    striped
    size="small"
    :scroll-x="1200"
  />
</template>

<style scoped>
/* Scraper name link */
.scraper-table :deep(.scraper-link) {
  color: #63b3ed;
  cursor: pointer;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s;
}
.scraper-table :deep(.scraper-link:hover) {
  color: #90cdf4;
}

/* Dim secondary text (type, last-seen) */
.scraper-table :deep(.cell-dim) {
  color: var(--text-color-secondary, #ffffff73);
  font-size: 13px;
}

/* Stage chip */
.scraper-table :deep(.cell-stage) {
  color: #ffffffb0;
  font-style: italic;
  font-size: 13px;
}

/* Status tag overrides — add a subtle glow matching the status color */
.scraper-table :deep(.status-tag) {
  display: inline-block;
  padding: 0 8px;
  height: 22px;
  line-height: 22px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.24);
  color: rgba(255, 255, 255, 0.82);
  background: transparent;
  white-space: nowrap;
}
.scraper-table :deep(.status-tag--active) {
  color: #63e2b7;
  border-color: rgba(24, 160, 88, 0.5);
  box-shadow: 0 0 6px rgba(24, 160, 88, 0.35);
}
.scraper-table :deep(.status-tag--warn) {
  color: #f2c97d;
  border-color: rgba(240, 160, 32, 0.5);
  box-shadow: 0 0 6px rgba(240, 160, 32, 0.35);
}
.scraper-table :deep(.status-tag--error) {
  color: #e88080;
  border-color: rgba(208, 48, 80, 0.5);
  box-shadow: 0 0 6px rgba(208, 48, 80, 0.35);
}
.scraper-table :deep(.status-tag--idle) {
  opacity: 0.8;
  background: rgba(112, 192, 232, 0.1);
  color: #70c0e8;
  border-color: rgba(112, 192, 232, 0.3);
  border-radius: 4px;
}

/* Workers:  active / total */
.scraper-table :deep(.cell-workers) {
  font-variant-numeric: tabular-nums;
}
.scraper-table :deep(.cell-workers__active) {
  color: #18a058;
  font-weight: 600;
}
.scraper-table :deep(.cell-workers__sep) {
  color: #ffffff40;
}
.scraper-table :deep(.cell-workers__total) {
  color: var(--text-color-secondary, #ffffff73);
}

/* Processed items:  done / total */
.scraper-table :deep(.cell-items) {
  font-variant-numeric: tabular-nums;
}
.scraper-table :deep(.cell-items__done) {
  color: #ffffffd1;
  font-weight: 500;
}
.scraper-table :deep(.cell-items__sep) {
  color: #ffffff40;
}
.scraper-table :deep(.cell-items__total) {
  color: var(--text-color-secondary, #ffffff73);
  font-size: 12px;
}

/* Rate */
.scraper-table :deep(.cell-rate) {
  color: #63e2b7;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

/* Status tag container */
.scraper-table :deep(.status-tag-container) {
  display: flex;
  align-items: center;
}

/* View button */
.scraper-table :deep(.scraper-view-btn) {
  font-size: 12px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.scraper-table :deep(.scraper-view-btn:hover) {
  opacity: 1;
}
</style>
