<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { NProgress } from "naive-ui";
import { useSinksStore } from "@/stores/sinks";
import { useRecordsStore } from "@/stores/records";
import type { FlavorSink } from "@/types";
import type { CentralDbDiffPage, CentralDbDiffRow, CentralDbStatus } from "./centralDbTypes";
import { useFormatters, type UiTable } from "@/composables";
import RecordJsonModal from "@/components/scrapers/RecordJsonModal.vue";

const props = defineProps<{
  scraperId: string;
  active: boolean;
  /** The sink declared by the scraper: diff grid columns and the table it publishes. */
  sink: FlavorSink;
  table: UiTable | null;
}>();

const store = useSinksStore();
const recordsStore = useRecordsStore();

const filterType = ref("ALL");
const page = ref(0);
const pageSize = ref(50);
const showConfirm = ref(false);
const jobError = ref<string | null>(null);
const autoRediffAfterSync = ref(false);
const lastHandledRejection = ref<string | null>(null);
const selected = ref<Set<string>>(new Set());
const showSyncMenu = ref(false);
const pendingScope = ref<"selected" | "all">("selected");
const jsonOpen = ref(false);
const jsonRecordId = ref<string | null>(null);
const headerCheck = ref<HTMLInputElement | null>(null);
const sortColumn = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("asc");
const columnFilters = ref<Record<string, string>>({});
let filterDebounce: ReturnType<typeof setTimeout> | null = null;

const filters = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "MODIFIED", label: "Modified" },
  { key: "DELETED", label: "Deleted" },
] as const;

const columns = computed(() => props.sink.columns);
const idCol = computed(() => props.table?.idColumn ?? "id");
const jsonColumn = computed(() => props.table?.jsonColumn ?? null);
const tableLabel = computed(() => props.table?.label ?? "table");

function rowId(row: CentralDbDiffRow): string {
  return String(row[idCol.value]);
}

function isLink(value: string): boolean {
  return /^https?:\/\//.test(value);
}

const { formatRelativeTime } = useFormatters();

const status = computed(() => store.getState<CentralDbStatus>(props.scraperId, props.sink.key));
const diffPage = computed(() => store.getPage<CentralDbDiffPage>(props.scraperId, props.sink.key));
const running = computed(() => Boolean(status.value?.jobRunning));
const loading = computed(
  () => store.isStateLoading(props.scraperId, props.sink.key) || running.value,
);
const pageBusy = computed(() => store.isPageLoading(props.scraperId, props.sink.key));
const progress = computed(() => status.value?.progress ?? null);
const lastDiff = computed(() => status.value?.lastDiff ?? null);
const lastSync = computed(() => status.value?.lastSync ?? null);
const rows = computed(() => diffPage.value?.rows ?? []);
const pageTotal = computed(() => diffPage.value?.total ?? 0);

const changeCount = computed(() => {
  const d = lastDiff.value;
  if (!d) return 0;
  return (d.newCount ?? 0) + (d.modifiedCount ?? 0) + (d.deletedCount ?? 0);
});

const filterCount = computed(() => {
  const d = lastDiff.value;
  return {
    ALL: changeCount.value,
    NEW: d?.newCount ?? 0,
    MODIFIED: d?.modifiedCount ?? 0,
    DELETED: d?.deletedCount ?? 0,
    UNCHANGED: d?.unchangedCount ?? 0,
  };
});

const canSyncSelected = computed(
  () => Boolean(lastDiff.value) && selected.value.size > 0 && !running.value,
);
const canSyncAll = computed(
  () => Boolean(lastDiff.value) && changeCount.value > 0 && !running.value,
);

const progressPercent = computed(() => {
  const p = progress.value;
  if (!p) return 0;
  if (p.step === "DONE") return 100;
  if (!p.total || p.total <= 0) return running.value ? 8 : 0;
  return Math.min(100, Math.round((p.processed / p.total) * 100));
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil(pageTotal.value / pageSize.value)),
);

const rangeLabel = computed(() => {
  if (pageTotal.value === 0) return "0 of 0";
  const from = page.value * pageSize.value + 1;
  const to = Math.min((page.value + 1) * pageSize.value, pageTotal.value);
  return `${from.toLocaleString()}–${to.toLocaleString()} of ${pageTotal.value.toLocaleString()}`;
});

const healthLabel = computed(() => {
  const name = props.sink.label;
  if (status.value?.enabled === false) return `${name} disabled`;
  if (status.value?.available) return `${name} reachable`;
  if (status.value?.enabled) return `${name} unreachable`;
  return `${name} status unknown`;
});

const progressStepLabel = computed(() => {
  const step = progress.value?.step;
  switch (step) {
    case "CONNECTING":
      return "CONNECTING";
    case "SCANNING_LOCAL":
      return "HASHING LOCAL";
    case "SCANNING_REMOTE":
      return "DOWNLOADING";
    case "SCANNING":
      return "COMPARING";
    default:
      return step || "WORKING";
  }
});

const lastPushLabel = computed(() => {
  const s = lastSync.value;
  if (!s?.success) return null;
  return `Last push: +${fmt(s.inserted)} / ~${fmt(s.updated)} / −${fmt(s.markedDeleted)}`;
});

const lastDiffLog = computed(() => {
  const d = lastDiff.value;
  if (!d) return null;
  if (d.resultMessage) return d.resultMessage;
  const counts = `+${fmt(d.newCount)} / ~${fmt(d.modifiedCount)} / −${fmt(d.deletedCount)}`;
  return `DIFF complete: ${counts}`;
});

const lastActionLog = computed(() => {
  const d = lastDiff.value;
  const s = lastSync.value;
  const dAt = d?.finishedAt ? Date.parse(d.finishedAt) : Number.NaN;
  const sAt = s?.finishedAt ? Date.parse(s.finishedAt) : Number.NaN;
  const dOk = Number.isFinite(dAt);
  const sOk = Number.isFinite(sAt) && Boolean(s?.success || s?.error);
  if (dOk && sOk) {
    return dAt >= sAt ? lastDiffLog.value : (s?.error ? `Push failed: ${s.error}` : lastPushLabel.value);
  }
  if (sOk) return s?.error ? `Push failed: ${s.error}` : lastPushLabel.value;
  return lastDiffLog.value;
});

const pageIds = computed(() =>
  rows.value.map(rowId).filter(Boolean),
);

const allPageSelected = computed(
  () => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.has(id)),
);

const somePageSelected = computed(
  () => pageIds.value.some((id) => selected.value.has(id)) && !allPageSelected.value,
);

watch(
  () => props.active && props.scraperId,
  (on) => {
    if (!on) return;
    jobError.value = null;
    store.loadState(props.scraperId, props.sink.key).then(() => {
      if (status.value?.lastDiff) {
        requestCurrentPage();
      }
    });
    store.refresh(props.scraperId, props.sink.key);
  },
  { immediate: true },
);

watch(
  () => [
    status.value?.jobRunning,
    status.value?.progress?.operation,
    status.value?.progress?.step,
    status.value?.rejection,
  ] as const,
  ([jobRunning, operation, step, rejection], prev) => {
    const s = status.value;
    if (!s) return;

    if (rejection && rejection !== lastHandledRejection.value) {
      lastHandledRejection.value = rejection;
      if (rejection === "CONFIRMATION_REQUIRED") {
        showConfirm.value = true;
        autoRediffAfterSync.value = false;
        jobError.value = null;
      } else if (
        rejection === "BLOCKED" ||
        rejection === "DISABLED" ||
        rejection === "CONFLICT" ||
        rejection === "ERROR"
      ) {
        jobError.value = s.rejectionMessage || rejection;
        autoRediffAfterSync.value = false;
      }
    }

    const wasRunning = prev?.[0];
    const justFinished = Boolean(wasRunning) && !jobRunning && step === "DONE";
    if (!justFinished) return;

    if (operation === "DIFF") {
      requestCurrentPage();
    }
    if (operation === "SYNC" && autoRediffAfterSync.value) {
      autoRediffAfterSync.value = false;
      selected.value = new Set();
      runDiff();
    }
  },
);

watch([filterType, pageSize], () => {
  page.value = 0;
  if (lastDiff.value && !running.value) {
    requestCurrentPage();
  }
});

watch(page, () => {
  if (lastDiff.value && !running.value) {
    requestCurrentPage();
  }
});

watch(
  columnFilters,
  () => {
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => goFirstPageOrReload(), 300);
  },
  { deep: true },
);

watch([allPageSelected, somePageSelected, headerCheck], () => {
  if (headerCheck.value) {
    headerCheck.value.indeterminate = somePageSelected.value;
  }
});

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString();
}

function cell(row: CentralDbDiffRow, key: string): string {
  const v = row[key];
  if (v == null || v === "") return "—";
  return String(v);
}

function rowClass(type: string): string {
  if (type === "NEW") return "row-new";
  if (type === "MODIFIED") return "row-modified";
  if (type === "DELETED") return "row-deleted";
  return "";
}

function isSelected(id: string): boolean {
  return selected.value.has(id);
}

function toggleRow(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function togglePage(ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked;
  const next = new Set(selected.value);
  if (checked) pageIds.value.forEach((id) => next.add(id));
  else pageIds.value.forEach((id) => next.delete(id));
  selected.value = next;
}

/** @param full compare every hash even when the consumer's fingerprint matches ("Full compare") */
async function runDiff(full = false) {
  jobError.value = null;
  showConfirm.value = false;
  lastHandledRejection.value = null;
  page.value = 0;
  selected.value = new Set();
  store.clearPage(props.scraperId, props.sink.key, emptyPage());
  try {
    await store.op(props.scraperId, props.sink.key, "DIFF", full ? { full: true } : undefined);
  } catch (e) {
    jobError.value = e instanceof Error ? e.message : "Failed to start diff";
  }
}

async function runSync(confirmed = false, scope: "selected" | "all" = pendingScope.value) {
  showSyncMenu.value = false;
  jobError.value = null;
  if (!confirmed) showConfirm.value = false;
  lastHandledRejection.value = null;
  pendingScope.value = scope;

  const recordIds =
    scope === "selected" ? Array.from(selected.value) : undefined;
  if (scope === "selected" && (!recordIds || recordIds.length === 0)) {
    jobError.value = "Select at least one row to sync";
    return;
  }

  autoRediffAfterSync.value = true;
  const token = confirmed
    ? status.value?.lastValidation?.confirmationToken ?? undefined
    : undefined;
  try {
    await store.op(props.scraperId, props.sink.key, "SYNC", {
      confirmationToken: token,
      recordIds,
    });
  } catch (e) {
    autoRediffAfterSync.value = false;
    jobError.value = e instanceof Error ? e.message : "Failed to start sync";
  }
}

function confirmSync() {
  showConfirm.value = false;
  runSync(true, pendingScope.value);
}

function emptyPage(): CentralDbDiffPage {
  return { type: "ALL", page: 0, size: 50, total: 0, rows: [] };
}

function requestCurrentPage() {
  store.requestPage(props.scraperId, props.sink.key, {
    type: filterType.value,
    page: page.value,
    size: pageSize.value,
    sortColumn: sortColumn.value,
    sortDir: sortColumn.value ? sortDir.value : "",
    filters: compactColumnFilters(),
  });
}

function compactColumnFilters(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(columnFilters.value)) {
    const t = v?.trim();
    if (t) out[k] = t;
  }
  return out;
}

function goFirstPageOrReload() {
  if (!lastDiff.value || running.value) return;
  if (page.value !== 0) page.value = 0;
  else requestCurrentPage();
}

function toggleSort(col: string) {
  if (sortColumn.value === col) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortColumn.value = col;
    sortDir.value = "asc";
  }
  goFirstPageOrReload();
}

function sortIndicator(col: string): string {
  if (sortColumn.value !== col) return "";
  return sortDir.value === "asc" ? " ▲" : " ▼";
}

function prevPage() {
  if (page.value > 0) page.value -= 1;
}

function nextPage() {
  if (page.value + 1 < pageCount.value) page.value += 1;
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

function onDocClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null;
  if (target && !target.closest(".sync-split")) {
    showSyncMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", onDocClick);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocClick);
  if (filterDebounce) clearTimeout(filterDebounce);
});
</script>

<template>
  <div class="central-db-tab">
    <div class="health-strip">
      <span
        class="dot"
        :class="{
          ok: status?.available,
          bad: status?.enabled && !status?.available,
          muted: !status?.enabled,
        }"
      />
      <span class="health-item" :title="status?.apiBaseUrl || undefined">{{ healthLabel }}</span>
      <span class="health-item"
        ><strong>Target:</strong> {{ status?.tableName || "—" }}</span
      >
      <span class="health-item"
        ><strong>Local:</strong> {{ fmt(status?.localCount) }}</span
      >
      <span class="health-item"
        ><strong>Remote:</strong> {{ fmt(status?.remoteCount) }}</span
      >
      <span v-if="status?.lastFullCompareAt" class="health-item"
        ><strong>Last full compare:</strong>
        {{ formatRelativeTime(status.lastFullCompareAt) }}</span
      >
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <button
          class="btn btn-primary btn-lg"
          :disabled="loading"
          @click="runDiff()"
        >
          <span v-if="loading && progress?.operation === 'DIFF'" class="spinner-sm" />
          {{ loading && progress?.operation === "DIFF" ? "Diffing…" : "Run Diff" }}
        </button>
        <button
          class="btn btn-secondary btn-lg"
          :disabled="loading"
          title="Download and compare every hash, even if the consumer's fingerprint matches"
          @click="runDiff(true)"
        >
          Full compare
        </button>

        <div class="sync-split">
          <button
            class="btn btn-primary btn-lg sync-main"
            :disabled="!canSyncSelected"
            @click="runSync(false, 'selected')"
          >
            <span v-if="loading && progress?.operation === 'SYNC'" class="spinner-sm" />
            Push / Sync
          </button>
          <button
            class="btn btn-primary btn-lg sync-caret"
            :disabled="!canSyncSelected && !canSyncAll"
            @click.stop="showSyncMenu = !showSyncMenu"
            title="Sync options"
          >
            ▾
          </button>
          <div v-if="showSyncMenu" class="sync-menu">
            <button
              class="sync-menu-item"
              :disabled="!canSyncSelected"
              @click="runSync(false, 'selected')"
            >
              For Selected
              <span class="menu-count">{{ selected.size }}</span>
            </button>
            <button
              class="sync-menu-item"
              :disabled="!canSyncAll"
              @click="runSync(false, 'all')"
            >
              For All
              <span class="menu-count">{{ fmt(changeCount) }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="toolbar-right">
        <div v-if="jobError" class="job-error">{{ jobError }}</div>
        <span
          v-else-if="!running && lastActionLog"
          class="last-action-log"
        >{{ lastActionLog }}</span>
      </div>
    </div>

    <div v-if="running || progress?.step === 'FAILED'" class="progress-panel">
      <div class="progress-copy">
        <span class="progress-step">{{ progressStepLabel }}</span>
        <span class="progress-msg">{{ progress?.message || "Working…" }}</span>
      </div>
      <NProgress
        type="line"
        :percentage="progressPercent"
        :height="18"
        :border-radius="4"
        :fill-border-radius="4"
        indicator-placement="inside"
        :processing="running"
        :status="progress?.step === 'FAILED' ? 'error' : 'success'"
      />
    </div>

    <div v-if="showConfirm" class="confirm-banner">
      <div class="confirm-title">Large delete — extra confirmation required</div>
      <p>{{ status?.rejectionMessage }}</p>
      <ul>
        <li
          v-for="check in status?.lastValidation?.checks ?? []"
          :key="check.id"
        >
          <strong>{{ check.severity }}</strong> — {{ check.message }}
        </li>
      </ul>
      <div class="confirm-actions">
        <button class="btn btn-secondary" @click="showConfirm = false">
          Cancel
        </button>
        <button class="btn btn-danger" @click="confirmSync">Push anyway</button>
      </div>
    </div>

    <div class="tabs-row">
      <div class="sub-tabs">
        <button
          v-for="f in filters"
          :key="f.key"
          :class="['sub-tab', { active: filterType === f.key }]"
          @click="filterType = f.key"
        >
          {{ f.label }}
          <span :class="['tab-count', f.key.toLowerCase()]">{{
            fmt(filterCount[f.key])
          }}</span>
        </button>
        <button
          class="sub-tab unchanged"
          disabled
          title="Unchanged records are not listed — count only"
        >
          Unchanged
          <span class="tab-count unchanged">{{
            fmt(filterCount.UNCHANGED)
          }}</span>
        </button>
      </div>
      <div class="pager">
        <span class="range">{{ rangeLabel }}</span>
        <select v-model.number="pageSize" class="page-size">
          <option :value="50">50 / page</option>
          <option :value="100">100 / page</option>
          <option :value="200">200 / page</option>
        </select>
        <button class="btn btn-sm btn-secondary" :disabled="page === 0 || pageBusy" @click="prevPage">
          Prev
        </button>
        <button
          class="btn btn-sm btn-secondary"
          :disabled="page + 1 >= pageCount || pageBusy"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>

    <div class="data-table-wrapper">
      <table v-if="lastDiff" class="data-table">
        <thead>
          <tr>
            <th class="col-check">
              <input
                ref="headerCheck"
                type="checkbox"
                title="Select all on this page"
                :checked="allPageSelected"
                @change="togglePage"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="sortable"
              title="Click to sort"
              @click="toggleSort(col.key)"
            >
              <span class="th-content">{{ col.label }}{{ sortIndicator(col.key) }}</span>
            </th>
            <th v-if="jsonColumn" class="col-json">{{ jsonColumn }}</th>
          </tr>
          <tr class="filter-row">
            <th class="col-check"></th>
            <th v-for="col in columns" :key="'filter-' + col.key">
              <input
                v-model="columnFilters[col.key]"
                type="text"
                class="column-filter-input"
                placeholder="Filter..."
                @click.stop
              />
            </th>
            <th v-if="jsonColumn" class="col-json"></th>
          </tr>
        </thead>
        <tbody v-if="rows.length === 0">
          <tr>
            <td :colspan="columns.length + (jsonColumn ? 2 : 1)" class="empty-cell">
              <template v-if="pageBusy">Loading page…</template>
              <template v-else>No rows match this view.</template>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr
            v-for="row in rows"
            :key="rowId(row)"
            :class="rowClass(String(row.diff_type))"
          >
            <td class="col-check">
              <input
                type="checkbox"
                :checked="isSelected(rowId(row))"
                @change="toggleRow(rowId(row))"
              />
            </td>
            <td v-for="col in columns" :key="col.key">
              <a
                v-if="isLink(cell(row, col.key))"
                :href="cell(row, col.key)"
                target="_blank"
                rel="noopener"
                >{{ cell(row, col.key) }}</a
              >
              <span v-else>{{ cell(row, col.key) }}</span>
            </td>
            <td v-if="jsonColumn" class="col-json">
              <button
                class="json-btn"
                type="button"
                :title="`View ${jsonColumn}`"
                @click="openJson(rowId(row))"
              >
                { }
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">
        <template v-if="pageBusy">Loading page…</template>
        <template v-else>Run a Diff to compare local {{ tableLabel }} with the central table.</template>
      </div>
    </div>

    <RecordJsonModal
      :open="jsonOpen"
      :title="jsonColumn ?? 'json'"
      :subtitle="jsonRecordId ?? ''"
      @close="closeJson"
    />
  </div>
</template>

<style scoped>
.central-db-tab {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  overflow: hidden;
}

.health-strip,
.toolbar,
.pager {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.health-strip {
  padding: 4px 0 0 4px;
  font-size: 0.85rem;
  color: var(--text-secondary, #6c757d);
}

.health-item strong {
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6c757d;
  flex-shrink: 0;
}
.dot.ok {
  background: #18a058;
}
.dot.bad {
  background: #d03050;
}
.dot.muted {
  background: #6c757d;
}

.toolbar {
  justify-content: flex-start;
  gap: 1rem;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.toolbar-right {
  flex: 1;
}

.last-action-log {
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
  line-height: 1.35;
}

.sync-split {
  position: relative;
  display: inline-flex;
  margin-left: 1.4rem;
}

.sync-main {
  border-radius: 4px 0 0 4px;
  padding-inline: 1.25rem;
}

.sync-caret {
  border-radius: 0 4px 4px 0;
  border-left: 1px solid rgba(255, 255, 255, 0.28);
  padding-inline: 0.55rem;
  min-width: 2rem;
}

.sync-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  overflow: hidden;
  z-index: 8;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.sync-menu-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-primary, #e0e0e0);
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.sync-menu-item:hover:not(:disabled) {
  background: var(--bg-hover, rgba(99, 130, 255, 0.12));
}

.sync-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-count {
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.75rem;
}

.job-error {
  color: #d03050;
  font-size: 0.85rem;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.progress-copy {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.85rem;
}

.progress-step {
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  letter-spacing: 0.04em;
}

.progress-msg {
  color: var(--text-secondary, #a0a0b0);
}

.confirm-banner {
  border: 1px solid #d03050;
  background: rgba(208, 48, 80, 0.08);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
}

.confirm-title {
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.sync-result {
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
  white-space: nowrap;
}

.tabs-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--border-color, #dee2e6);
}

.sub-tabs {
  display: flex;
  gap: 0.15rem;
  min-width: 0;
}

.sub-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-secondary, #6c757d);
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: -1px;
}

.sub-tab:hover:not(:disabled) {
  color: var(--text-primary, #212529);
}

.sub-tab.active {
  color: var(--primary, #0d6efd);
  border-bottom-color: var(--primary, #0d6efd);
}

.sub-tab.unchanged,
.sub-tab:disabled {
  cursor: default;
  opacity: 0.85;
}

.tab-count {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.08rem 0.45rem;
  border-radius: 999px;
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e0e0e0);
}

.tab-count.new {
  background: rgba(24, 160, 88, 0.28);
}
.tab-count.modified {
  background: rgba(240, 192, 32, 0.28);
}
.tab-count.deleted {
  background: rgba(208, 48, 80, 0.28);
}
.tab-count.unchanged {
  background: rgba(255, 255, 255, 0.08);
}

.pager {
  justify-content: flex-end;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
  flex-wrap: nowrap;
  margin-left: auto;
}

.page-size {
  background: var(--bg-primary, #141422);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  padding: 0.25rem 0.4rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.35rem 0.75rem;
  transition: background 0.2s;
}

.btn-lg {
  font-size: 0.95rem;
  padding: 0.55rem 1.15rem;
  font-weight: 600;
}

.btn-sm {
  padding: 0.3rem 0.6rem;
}

.btn-primary {
  background: var(--primary, #0d6efd);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, #0b5ed7);
}
.btn-secondary {
  background: var(--bg-tertiary, #e9ecef);
  color: var(--text-primary, #212529);
}
.btn-danger {
  background: #d03050;
  color: #fff;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-sm {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.data-table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.data-table th {
  background: var(--bg-secondary, #1e1e2e);
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--border-color, #333);
  color: var(--text-secondary, #a0a0b0);
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  user-select: none;
}

.sortable {
  cursor: pointer;
}

.sortable:hover {
  color: var(--primary, #63e2b7);
}

.th-content {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.filter-row th {
  padding: 0.2rem 0.3rem;
  border-bottom: 1px solid var(--border-color, #333);
  background: var(--bg-secondary, #1e1e2e);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.column-filter-input {
  width: 100%;
  min-width: 72px;
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  border: 1px solid var(--border-color, #444);
  border-radius: 3px;
  background: var(--bg-primary, #141422);
  color: var(--text-primary, #e0e0e0);
  outline: none;
  box-sizing: border-box;
}

.column-filter-input:focus {
  border-color: var(--primary, #0d6efd);
}

.column-filter-input::placeholder {
  color: var(--text-tertiary, #555);
  text-transform: none;
}

.data-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border-light, #2a2a3a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
  color: var(--text-primary, #e0e0e0);
}

.col-check {
  width: 36px;
  text-align: center;
}

.col-json {
  width: 72px;
  text-align: center;
}

.json-btn {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.12);
  border: 1px solid rgba(99, 226, 183, 0.35);
  border-radius: 4px;
  padding: 0.15rem 0.45rem;
  cursor: pointer;
}

.json-btn:hover {
  background: rgba(99, 226, 183, 0.22);
}

.data-table tbody tr:hover {
  filter: brightness(1.08);
}

.row-new {
  background: rgba(24, 160, 88, 0.16);
}
.row-modified {
  background: rgba(240, 192, 32, 0.16);
}
.row-deleted {
  background: rgba(208, 48, 80, 0.16);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #6c757d);
}

.empty-cell {
  text-align: center;
  color: var(--text-secondary, #6c757d);
  padding: 1.5rem 0.75rem !important;
}

a {
  color: var(--primary, #63e2b7);
}
</style>
