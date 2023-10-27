<script setup lang="ts">
import { computed, h, onUnmounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NDataTable,
  NInput,
  NProgress,
  NSpace,
  NTag,
  NText,
  useDialog,
} from "naive-ui";
import type { DataTableColumns, DataTableRowKey, DataTableSortState } from "naive-ui";
import { useSinksStore } from "@/stores/sinks";
import { useRecordsStore } from "@/stores/records";
import type { FlavorSink, FlavorSinkOperation } from "@/types";
import type { UiTable } from "@/composables";
import RecordJsonModal from "@/components/scrapers/RecordJsonModal.vue";

/**
 * The generic panel for a `RECORDS` sink: a grid over rows the scraper serves with `PAGE`, and one button per
 * operation the sink declares. Nothing here is specific to a flavor.
 *
 * What the scraper sends (SINK_STATE body):  { message?, progress?: {processed, total, message?},
 *   rejection?, rejectionMessage?, error?, summary?: { label: number | string } }
 *   `progress` is present only while an operation runs.
 * What it answers to PAGE (SINK_PAGE body):  the request's page, size, sortColumn, sortDir, filters, requestId,
 *   plus `total` and `rows`.
 * It also answers `STATUS` with a state; the panel asks for one whenever it opens.
 */
interface RecordsState {
  message?: string | null;
  progress?: { processed: number; total: number; message?: string | null } | null;
  rejection?: string | null;
  rejectionMessage?: string | null;
  error?: string | null;
  summary?: Record<string, string | number> | null;
}
type Row = Record<string, unknown>;
interface RecordsPage {
  rows: Row[];
  total: number;
}

const props = defineProps<{
  scraperId: string;
  active: boolean;
  sink: FlavorSink;
  table: UiTable | null;
}>();

const sinks = useSinksStore();
const recordsStore = useRecordsStore();
const dialog = useDialog();

const page = ref(0);
const pageSize = ref(50);
const sortColumn = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("asc");
const columnFilters = ref<Record<string, string>>({});
const checked = ref<DataTableRowKey[]>([]);
const jsonOpen = ref(false);
const jsonRecordId = ref<string | null>(null);
let filterDebounce: ReturnType<typeof setTimeout> | null = null;

const idCol = computed(() => props.table?.idColumn ?? "id");
const jsonColumn = computed(() => props.table?.jsonColumn ?? null);
const operations = computed<FlavorSinkOperation[]>(() => props.sink.operations ?? []);

const state = computed(() => sinks.getState<RecordsState>(props.scraperId, props.sink.key));
const current = computed(() => sinks.getPage<RecordsPage>(props.scraperId, props.sink.key));
const rows = computed(() => current.value?.rows ?? []);
const total = computed(() => current.value?.total ?? 0);
const pageBusy = computed(() => sinks.isPageLoading(props.scraperId, props.sink.key));
const progress = computed(() => state.value?.progress ?? null);
const busy = computed(() => Boolean(progress.value) || sinks.isStateLoading(props.scraperId, props.sink.key));
const problem = computed(() => state.value?.rejectionMessage || state.value?.error || null);
const progressPercent = computed(() => {
  const p = progress.value;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.processed / p.total) * 100));
});

function rowId(row: Row): string {
  return String(row[idCol.value]);
}

function cell(value: unknown): string {
  return value == null || value === "" ? "—" : String(value);
}

const columns = computed<DataTableColumns<Row>>(() => {
  const cols: DataTableColumns<Row> = [{ type: "selection" }];
  for (const col of props.sink.columns) {
    cols.push({
      title: col.label,
      key: col.key,
      sorter: true,
      sortOrder: sortColumn.value === col.key ? (sortDir.value === "asc" ? "ascend" : "descend") : false,
      ellipsis: { tooltip: true },
      render: (row) => {
        const text = cell(row[col.key]);
        return /^https?:\/\//.test(text)
          ? h("a", { href: text, target: "_blank", rel: "noopener" }, text)
          : text;
      },
    });
  }
  if (jsonColumn.value) {
    cols.push({
      title: "",
      key: "__json",
      width: 56,
      render: (row) =>
        h(
          NButton,
          { size: "tiny", quaternary: true, title: `View ${jsonColumn.value}`, onClick: () => openJson(rowId(row)) },
          { default: () => "{ }" },
        ),
    });
  }
  return cols;
});

const pagination = computed(() => ({
  page: page.value + 1,
  pageSize: pageSize.value,
  itemCount: total.value,
  pageSizes: [50, 100, 200],
  showSizePicker: true,
  onUpdatePage: (p: number) => {
    page.value = p - 1;
  },
  onUpdatePageSize: (s: number) => {
    pageSize.value = s;
    page.value = 0;
  },
}));

function requestCurrentPage() {
  const filters: Record<string, string> = {};
  for (const [k, v] of Object.entries(columnFilters.value)) {
    if (v?.trim()) filters[k] = v.trim();
  }
  sinks.requestPage(props.scraperId, props.sink.key, {
    page: page.value,
    size: pageSize.value,
    sortColumn: sortColumn.value,
    sortDir: sortColumn.value ? sortDir.value : "",
    filters,
  });
}

function backToFirstPage() {
  if (page.value !== 0) page.value = 0;
  else requestCurrentPage();
}

function onSorter(sorter: DataTableSortState | DataTableSortState[] | null) {
  const s = Array.isArray(sorter) ? sorter[0] : sorter;
  if (!s || !s.order) {
    sortColumn.value = null;
  } else {
    sortColumn.value = String(s.columnKey);
    sortDir.value = s.order === "ascend" ? "asc" : "desc";
  }
  backToFirstPage();
}

function refresh() {
  checked.value = [];
  sinks.refresh(props.scraperId, props.sink.key);
}

function run(op: FlavorSinkOperation) {
  const params = op.scope === "SELECTED" ? { recordIds: checked.value.map(String) } : undefined;
  sinks.op(props.scraperId, props.sink.key, op.op, params).catch(() => undefined);
}

function onOperation(op: FlavorSinkOperation) {
  if (op.confirm) {
    dialog.warning({
      title: op.label,
      content: op.confirm,
      positiveText: op.label,
      negativeText: "Cancel",
      onPositiveClick: () => run(op),
    });
  } else {
    run(op);
  }
}

function disabled(op: FlavorSinkOperation): boolean {
  return busy.value || (op.scope === "SELECTED" && checked.value.length === 0);
}

function openJson(recordId: string) {
  jsonRecordId.value = recordId;
  jsonOpen.value = true;
  recordsStore.request(props.scraperId, props.sink.table, recordId);
}

function closeJson() {
  jsonOpen.value = false;
  recordsStore.clear();
}

// Opening the tab: show what the Manager cached, then ask the scraper for a fresh state.
watch(
  () => props.active && props.scraperId,
  (on) => {
    if (!on) return;
    sinks.loadState(props.scraperId, props.sink.key);
    sinks.refresh(props.scraperId, props.sink.key);
  },
  { immediate: true },
);

// A new state means the data may have changed (an operation finished, a run added rows): reload the page,
// unless an operation is still running.
watch(state, () => {
  if (props.active && !progress.value) requestCurrentPage();
});

watch([page, pageSize], requestCurrentPage);

watch(
  columnFilters,
  () => {
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(backToFirstPage, 300);
  },
  { deep: true },
);

onUnmounted(() => {
  if (filterDebounce) clearTimeout(filterDebounce);
});
</script>

<template>
  <div class="records-panel">
    <div class="head">
      <NSpace align="center" :wrap="true">
        <NButton
          v-for="op in operations"
          :key="op.op"
          size="small"
          type="primary"
          :disabled="disabled(op)"
          @click="onOperation(op)"
        >
          {{ op.label }}
        </NButton>
        <NButton size="small" :disabled="busy" @click="refresh">Refresh</NButton>
        <NTag v-for="(value, label) in state?.summary ?? {}" :key="label" size="small" round>
          {{ label }}: {{ typeof value === "number" ? value.toLocaleString() : value }}
        </NTag>
        <NText v-if="state?.message" depth="3">{{ state.message }}</NText>
      </NSpace>
    </div>

    <NAlert v-if="problem" type="error" :show-icon="false">{{ problem }}</NAlert>

    <div v-if="progress" class="progress">
      <NText depth="3">{{ progress.message || "Working…" }}</NText>
      <NProgress type="line" :percentage="progressPercent" :height="14" :processing="true" indicator-placement="inside" />
    </div>

    <div class="filters">
      <NInput
        v-for="col in sink.columns"
        :key="col.key"
        v-model:value="columnFilters[col.key]"
        size="tiny"
        clearable
        :placeholder="`Filter ${col.label}`"
        class="filter"
      />
    </div>

    <NDataTable
      remote
      flex-height
      size="small"
      class="grid"
      :columns="columns"
      :data="rows"
      :loading="pageBusy"
      :row-key="rowId"
      :pagination="pagination"
      v-model:checked-row-keys="checked"
      @update:sorter="onSorter"
    />

    <RecordJsonModal
      :open="jsonOpen"
      :title="jsonColumn ?? 'json'"
      :subtitle="jsonRecordId ?? ''"
      @close="closeJson"
    />
  </div>
</template>

<style scoped>
.records-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  overflow: hidden;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter {
  width: 150px;
}

.grid {
  flex: 1;
  min-height: 0;
}
</style>
