<script setup lang="ts">
import { computed, h } from "vue";
import { useRouter } from "vue-router";
import { NDataTable, NTag, NProgress, NTooltip, NText } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import type { Worker } from "@/types";
import { useWorkersStore } from "@/stores/workers";
import { useScrapersStore } from "@/stores/scrapers";
import { useStatusColors } from "@/composables/useStatusColors";
import { useFormatters } from "@/composables/useFormatters";

type RowKey = string | number;

const props = defineProps<{
  scraperId: string;
  selectable?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", workerIds: string[]): void;
}>();

const router = useRouter();
const workersStore = useWorkersStore();
const scrapersStore = useScrapersStore();
const { getStatusType } = useStatusColors();
const { formatNumber, formatRelativeTime, formatPercent, formatRate } =
  useFormatters();

const scraperPaused = computed(
  () => scrapersStore.scrapers.get(props.scraperId)?.status === "PAUSED",
);

const checkedRowKeys = defineModel<string[]>("checkedRowKeys", { default: [] });

const columns = computed<DataTableColumns<Worker>>(() => [
  {
    type: "selection",
    disabled: () => !props.selectable,
  },
  {
    title: "Worker",
    key: "name",
    width: 150,
    render: (row) =>
      h(
        "a",
        {
          class: "text-blue-400 hover:text-blue-300 cursor-pointer",
          onClick: () =>
            router.push(`/scrapers/${row.scraperId}/workers/${row.workerId}`),
        },
        row.name || row.workerId,
      ),
  },
  {
    title: "Status",
    key: "status",
    width: 100,
    render: (row) => {
      const displayStatus =
        scraperPaused.value && row.status !== "PAUSED" ? "PAUSED" : row.status;
      return h(
        NTag,
        {
          type: getStatusType(displayStatus),
          size: "small",
          round: true,
        },
        { default: () => displayStatus },
      );
    },
  },
  {
    title: "Proxy",
    key: "proxy",
    width: 150,
    render: (row) =>
      row.proxyIp
        ? h(
            NText,
            { code: true, depth: 3 },
            { default: () => `${row.proxyIp}:${row.proxyPort}` },
          )
        : "-",
  },
  {
    title: "Task",
    key: "currentTask",
    width: 120,
    ellipsis: { tooltip: true },
  },
  {
    title: "Progress",
    key: "progress",
    width: 140,
    render: (row) => {
      // Compute progress from items if available, fall back to progressPercent
      const total = row.metrics?.totalItems || 0;
      const processed = row.metrics?.processedItems || 0;
      const percent =
        total > 0
          ? Math.round((processed / total) * 100)
          : row.metrics?.progressPercent || 0;
      return h(NTooltip, null, {
        trigger: () =>
          h(NProgress, {
            type: "line",
            percentage: percent,
            showIndicator: false,
            height: 6,
            borderRadius: 3,
            fillBorderRadius: 3,
            status:
              row.status === "ERROR"
                ? "error"
                : row.status === "RUNNING"
                  ? "success"
                  : row.status === "INITIALIZING"
                    ? "info"
                    : "default",
          }),
        default: () => `${formatPercent(percent)} complete`,
      });
    },
  },
  {
    title: "Items",
    key: "items",
    width: 100,
    render: (row) =>
      `${formatNumber(row.metrics?.processedItems || 0)} / ${formatNumber(row.metrics?.totalItems || 0)}`,
  },
  {
    title: "Rate",
    key: "rate",
    width: 70,
    render: (row) => formatRate(row.metrics?.itemsPerSecond || 0),
  },
  {
    title: "Success",
    key: "success",
    width: 70,
    render: (row) =>
      h(
        NText,
        {
          type:
            (row.metrics?.successRate || 100) >= 95
              ? "success"
              : (row.metrics?.successRate || 100) >= 80
                ? "warning"
                : "error",
        },
        { default: () => formatPercent(row.metrics?.successRate || 100) },
      ),
  },
  {
    title: "Detections",
    key: "detections",
    width: 80,
    render: (row) =>
      h(
        NText,
        { type: row.detectionCount > 0 ? "warning" : "default" },
        { default: () => row.detectionCount },
      ),
  },
  {
    title: "Last Active",
    key: "lastActivityAt",
    width: 100,
    render: (row) => formatRelativeTime(row.lastActivityAt),
  },
]);

const workers = computed(() =>
  workersStore.getWorkersForScraper(props.scraperId),
);

function handleCheckedRowKeysUpdate(keys: RowKey[]) {
  checkedRowKeys.value = keys as string[];
  emit("select", keys as string[]);
}
</script>

<template>
  <NDataTable
    :columns="columns"
    :data="workers"
    :row-key="(row: Worker) => row.workerId"
    :checked-row-keys="checkedRowKeys"
    :bordered="false"
    :single-line="false"
    striped
    size="small"
    :scroll-x="1100"
    @update:checked-row-keys="handleCheckedRowKeysUpdate"
  />
</template>
