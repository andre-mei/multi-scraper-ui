<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useDataStore } from "@/stores/data";
import { useRecordsStore } from "@/stores/records";
import { api } from "@/api";
import type { UiTable } from "@/composables/usePhases";
import RecordJsonModal from "./RecordJsonModal.vue";

const props = defineProps<{
  scraperId: string;
  active: boolean;
  subTab?: string;
  /** The tables of the scraper's local database. */
  tables: UiTable[];
}>();

const emit = defineEmits<{
  (e: "update:subTab", value: string): void;
}>();

const dataStore = useDataStore();
const recordsStore = useRecordsStore();

// The URL segment is the slug of the table's label; an unknown one opens the first table.
function routeToKey(param: string | undefined): string {
  const found = props.tables.find((t) => t.routeKey === param) ?? props.tables[0];
  return found?.key ?? "";
}
function keyToRoute(key: string): string {
  const found = props.tables.find((t) => t.key === key) ?? props.tables[0];
  return found?.routeKey ?? "";
}

const activeTable = computed({
  get() {
    return routeToKey(props.subTab);
  },
  set(key: string) {
    emit("update:subTab", keyToRoute(key));
  },
});

const records = computed(() =>
  dataStore.getRecords(props.scraperId, activeTable.value),
);
const totalCount = computed(() =>
  dataStore.getTotalCount(props.scraperId, activeTable.value),
);
const bufferSize = computed(() =>
  dataStore.getBufferSize(props.scraperId, activeTable.value),
);
const loading = computed(() =>
  dataStore.isLoading(props.scraperId, activeTable.value),
);
const table = computed(
  () => props.tables.find((t) => t.key === activeTable.value) ?? null,
);
// The { } column exists only for tables that declare a JSON column.
const hasJson = computed(() => !!table.value?.jsonColumn && !!table.value?.idColumn);

const jsonOpen = ref(false);
const jsonRecordId = ref<string | null>(null);

// ==================== Column Management ====================

interface ColumnPrefs {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

const columnPrefs = ref<Record<string, ColumnPrefs>>({});
const columnFilters = ref<Record<string, string>>({});
const showColumnMenu = ref(false);
const draggedColumn = ref<string | null>(null);
const prefsLoaded = ref(false);

// ==================== Column Display Names ====================

function columnDisplayName(col: string): string {
  return table.value?.columnLabels?.[col] ?? col;
}

// ==================== Sorting ====================

interface SortState {
  column: string | null;
  direction: "asc" | "desc";
}

const sortState = ref<Record<string, SortState>>({});

function getSort(): SortState {
  const key = activeTable.value;
  if (!sortState.value[key]) {
    const declared = table.value?.defaultSort;
    sortState.value[key] = declared
      ? { column: declared.column, direction: declared.direction }
      : { column: null, direction: "asc" };
  }
  return sortState.value[key];
}

function toggleSort(col: string) {
  const sort = getSort();
  if (sort.column === col) {
    sort.direction = sort.direction === "asc" ? "desc" : "asc";
  } else {
    sort.column = col;
    sort.direction = "asc";
  }
}

function sortIndicator(col: string): string {
  const sort = getSort();
  if (sort.column !== col) return "";
  return sort.direction === "asc" ? " ▲" : " ▼";
}

function prefKey(table: string): string {
  return `dataTable:${table}`;
}

// Every key found in any row, in first-seen order, so a sparse first row hides nothing.
const allColumns = computed(() => {
  if (records.value.length === 0) return [];
  const hidden = table.value?.hiddenColumns ?? [];
  const seen = new Set<string>();
  for (const row of records.value) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen].filter(
    (c) => c !== table.value?.jsonColumn && !hidden.includes(c),
  );
});

// Get or create prefs for current table
function getPrefs(): ColumnPrefs {
  const key = activeTable.value;
  if (!columnPrefs.value[key]) {
    columnPrefs.value[key] = { order: [], hidden: [], widths: {} };
  }
  return columnPrefs.value[key];
}

// Visible columns in user-defined order
const visibleColumns = computed(() => {
  const prefs = getPrefs();
  const all = allColumns.value;
  if (all.length === 0) return [];

  // Start with user order, add any new columns at the end
  const ordered: string[] = [];
  for (const col of prefs.order) {
    if (all.includes(col)) ordered.push(col);
  }
  for (const col of all) {
    if (!ordered.includes(col)) ordered.push(col);
  }

  // Filter out hidden
  return ordered.filter((c) => !prefs.hidden.includes(c));
});

// Filtered and sorted records
const filteredRecords = computed(() => {
  let rows = records.value;
  const filters = columnFilters.value;

  for (const [col, query] of Object.entries(filters)) {
    if (!query) continue;
    const q = query.toLowerCase();
    rows = rows.filter((row: Record<string, unknown>) => {
      const val = formatCellValue(row[col], col).toLowerCase();
      return val.includes(q);
    });
  }

  const sort = getSort();
  if (sort.column) {
    const col = sort.column;
    const dir = sort.direction === "asc" ? 1 : -1;
    rows = [...rows].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) => {
        const va = a[col];
        const vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return dir;
        if (vb == null) return -dir;
        if (typeof va === "number" && typeof vb === "number")
          return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      },
    );
  }

  return rows;
});

function isColumnVisible(col: string): boolean {
  return !getPrefs().hidden.includes(col);
}

function toggleColumnVisibility(col: string) {
  const prefs = getPrefs();
  const idx = prefs.hidden.indexOf(col);
  if (idx >= 0) {
    prefs.hidden.splice(idx, 1);
  } else {
    prefs.hidden.push(col);
  }
  savePrefsDebounced();
}

// Drag & drop reorder
function onDragStart(col: string) {
  draggedColumn.value = col;
}

function onDragOver(e: DragEvent, col: string) {
  e.preventDefault();
  if (!draggedColumn.value || draggedColumn.value === col) return;
}

function onDrop(col: string) {
  if (!draggedColumn.value || draggedColumn.value === col) return;

  const prefs = getPrefs();
  // Ensure order array is populated
  if (prefs.order.length === 0) {
    prefs.order = [...allColumns.value];
  }

  const fromIdx = prefs.order.indexOf(draggedColumn.value);
  const toIdx = prefs.order.indexOf(col);
  if (fromIdx < 0 || toIdx < 0) return;

  prefs.order.splice(fromIdx, 1);
  prefs.order.splice(toIdx, 0, draggedColumn.value);
  draggedColumn.value = null;
  savePrefsDebounced();
}

function onDragEnd() {
  draggedColumn.value = null;
}

// Column resize
const resizing = ref<{
  col: string;
  startX: number;
  startWidth: number;
} | null>(null);

function startResize(e: MouseEvent, col: string) {
  e.preventDefault();
  const th = (e.target as HTMLElement).parentElement;
  if (!th) return;
  resizing.value = { col, startX: e.clientX, startWidth: th.offsetWidth };
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
}

function onResizeMove(e: MouseEvent) {
  if (!resizing.value) return;
  const diff = e.clientX - resizing.value.startX;
  const newWidth = Math.max(40, resizing.value.startWidth + diff);
  const prefs = getPrefs();
  prefs.widths[resizing.value.col] = newWidth;
}

function onResizeEnd() {
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  if (resizing.value) {
    resizing.value = null;
    savePrefsDebounced();
  }
}

function getColumnWidth(col: string): string | undefined {
  const w = getPrefs().widths[col];
  return w ? `${w}px` : undefined;
}

// Persistence
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function savePrefsDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const key = prefKey(activeTable.value);
    api
      .savePreference(key, getPrefs())
      .catch((err) => console.error("Failed to save column prefs:", err));
  }, 500);
}

// Saved prefs are loaded once per table.
const prefsRequested = new Set<string>();

async function loadPrefs() {
  for (const t of props.tables) {
    if (prefsRequested.has(t.key)) continue;
    prefsRequested.add(t.key);
    const saved = await api.getPreference<ColumnPrefs>(prefKey(t.key));
    if (saved) {
      columnPrefs.value[t.key] = saved;
    }
  }
  prefsLoaded.value = true;
}

function resetPrefs() {
  columnPrefs.value[activeTable.value] = { order: [], hidden: [], widths: {} };
  columnFilters.value = {};
  savePrefsDebounced();
}

// ==================== Data Operations ====================

function refresh() {
  dataStore.fetchData(props.scraperId, activeTable.value);
}

function clearData() {
  dataStore.clearData(props.scraperId, activeTable.value);
}

watch(
  () => props.tables.map((t) => t.key).join(","),
  loadPrefs,
  { immediate: true },
);

watch(
  () => props.active,
  (isActive) => {
    if (isActive && activeTable.value) dataStore.fetchData(props.scraperId, activeTable.value);
    else closeJson();
  },
  { immediate: true },
);

watch(activeTable, () => {
  closeJson();
  if (props.active && activeTable.value) {
    dataStore.loadBufferedData(props.scraperId, activeTable.value);
    dataStore.fetchData(props.scraperId, activeTable.value);
  }
  // Clear filters when switching tables
  columnFilters.value = {};
});

function formatCellValue(value: unknown, col?: string): string {
  if (value === null || value === undefined) return "—";
  if (col && isDateColumn(col) && typeof value === "string") {
    return formatDateValue(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isDateColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return (
    lower.includes("date") ||
    lower.includes("_at") ||
    lower.includes("timestamp")
  );
}

function formatDateValue(value: string): string {
  // Parse ISO or datetime string and format as "2026-04-27 | 19:25:57"
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const date =
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const time =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0");
  return date + " | " + time;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + "…" : str;
}

function recordIdOf(row: Record<string, unknown>): string {
  const idColumn = table.value?.idColumn;
  const v = idColumn ? row[idColumn] : null;
  return v == null ? "" : String(v);
}

function openJson(recordId: string) {
  if (!recordId || !table.value) return;
  jsonRecordId.value = recordId;
  jsonOpen.value = true;
  recordsStore.request(props.scraperId, table.value.key, recordId);
}

function closeJson() {
  if (!jsonOpen.value) return;
  jsonOpen.value = false;
  jsonRecordId.value = null;
  recordsStore.clear();
}

function isWrappableColumn(col: string): boolean {
  const upper = col.toUpperCase();
  return (
    upper.includes("URL") || upper.includes("LINK") || upper.includes("PATH")
  );
}

</script>

<template>
  <div class="data-tab">
    <div v-if="tables.length === 0" class="empty-state">
      This scraper does not publish data tables.
    </div>
    <template v-else>
      <!-- Sub-tab selector -->
      <div class="sub-tabs">
        <button
          v-for="t in tables"
          :key="t.key"
          :class="['sub-tab', { active: activeTable === t.key }]"
          @click="activeTable = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Toolbar -->
      <div class="data-toolbar">
        <div class="data-stats">
          <span class="stat"
            ><strong>Buffer:</strong> {{ bufferSize }} records</span
          >
          <span class="stat"
            ><strong>DB Total:</strong> {{ totalCount }} records</span
          >
          <span v-if="filteredRecords.length !== records.length" class="stat">
            <strong>Filtered:</strong> {{ filteredRecords.length }} records
          </span>
        </div>
        <div class="data-actions">
          <!-- Column visibility menu -->
          <div class="column-menu-wrapper">
            <button
              class="btn btn-sm btn-secondary"
              @click="showColumnMenu = !showColumnMenu"
              title="Show/hide columns"
            >
              Columns ▾
            </button>
            <div
              v-if="showColumnMenu"
              class="column-menu"
              @mouseleave="showColumnMenu = false"
            >
              <div class="column-menu-header">
                <span>Visible Columns</span>
                <button class="btn-link" @click="resetPrefs">Reset</button>
              </div>
              <label
                v-for="col in allColumns"
                :key="col"
                class="column-menu-item"
              >
                <input
                  type="checkbox"
                  :checked="isColumnVisible(col)"
                  @change="toggleColumnVisibility(col)"
                />
                {{ col }}
              </label>
            </div>
          </div>
          <button
            class="btn btn-sm btn-secondary"
            @click="clearData"
            :disabled="loading"
          >
            Clear
          </button>
          <button
            class="btn btn-sm btn-primary"
            @click="refresh"
            :disabled="loading"
          >
            <span v-if="loading" class="spinner-sm"></span>
            {{ loading ? "Fetching..." : "Refresh" }}
          </button>
        </div>
      </div>

      <!-- Data table -->
      <div class="data-table-wrapper">
        <table v-if="records.length > 0" class="data-table">
          <thead>
            <!-- Column headers (draggable for reorder) -->
            <tr>
              <th v-if="hasJson" class="col-json">JSON</th>
              <th
                v-for="col in visibleColumns"
                :key="col"
                :style="{ width: getColumnWidth(col) }"
                draggable="true"
                @dragstart="onDragStart(col)"
                @dragover="(e) => onDragOver(e, col)"
                @drop="onDrop(col)"
                @dragend="onDragEnd"
                :class="{ 'drag-over': draggedColumn && draggedColumn !== col }"
              >
                <span
                  class="th-content"
                  @click="toggleSort(col)"
                  style="cursor: pointer"
                  >{{ columnDisplayName(col) }}{{ sortIndicator(col) }}</span
                >
                <span
                  class="resize-handle"
                  @mousedown="(e) => startResize(e, col)"
                ></span>
              </th>
            </tr>
            <!-- Filter row -->
            <tr class="filter-row">
              <th v-if="hasJson" class="col-json"></th>
              <th v-for="col in visibleColumns" :key="'filter-' + col">
                <input
                  v-model="columnFilters[col]"
                  type="text"
                  class="column-filter-input"
                  placeholder="Filter..."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in filteredRecords" :key="idx">
              <td v-if="hasJson" class="col-json">
                <button
                  class="json-btn"
                  type="button"
                  title="View details JSON"
                  :disabled="!recordIdOf(row)"
                  @click="openJson(recordIdOf(row))"
                >
                  { }
                </button>
              </td>
              <td
                v-for="col in visibleColumns"
                :key="col"
                :style="{ width: getColumnWidth(col) }"
                :title="formatCellValue(row[col], col)"
                :class="{ 'cell-wrap': isWrappableColumn(col) }"
              >
                {{
                  isWrappableColumn(col)
                    ? formatCellValue(row[col], col)
                    : truncate(formatCellValue(row[col], col), 120)
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">
          <p v-if="loading">Loading data...</p>
          <p v-else>
            No data available. Click <strong>Refresh</strong> to fetch records
            from the scraper database.
          </p>
        </div>
      </div>

      <RecordJsonModal
        :open="jsonOpen"
        :title="table?.jsonColumn ?? ''"
        :subtitle="jsonRecordId ?? ''"
        @close="closeJson"
      />
    </template>
  </div>
</template>

<style scoped>
.data-tab {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  overflow: hidden;
}

.sub-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-color, #dee2e6);
  padding-bottom: 0;
}

.sub-tab {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-secondary, #6c757d);
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.sub-tab:hover {
  color: var(--text-primary, #212529);
}

.sub-tab.active {
  color: var(--primary, #0d6efd);
  border-bottom-color: var(--primary, #0d6efd);
}

.data-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
}

.data-stats {
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #6c757d);
}

.data-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
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
.btn-secondary:hover:not(:disabled) {
  background: var(--bg-quaternary, #ced4da);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary, #0d6efd);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}
.btn-link:hover {
  text-decoration: underline;
}

.spinner-sm {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Column visibility menu */
.column-menu-wrapper {
  position: relative;
}

.column-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  padding: 0.5rem;
  min-width: 180px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.column-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border-color, #333);
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #a0a0b0);
}

.column-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
  border-radius: 3px;
}

.column-menu-item:hover {
  background: var(--bg-hover, rgba(99, 130, 255, 0.08));
}

.column-menu-item input[type="checkbox"] {
  accent-color: var(--primary, #0d6efd);
}

/* Data table */
.data-table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
}

.data-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  table-layout: fixed;
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
  min-width: 60px;
  position: relative;
  user-select: none;
}

.th-content {
  cursor: grab;
}

.th-content:active {
  cursor: grabbing;
}

.drag-over {
  border-left: 2px solid var(--primary, #0d6efd);
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
}

.resize-handle:hover {
  background: var(--primary, #0d6efd);
  opacity: 0.5;
}

/* Filter row */
.filter-row th {
  padding: 0.2rem 0.3rem;
  border-bottom: 1px solid var(--border-color, #333);
  background: var(--bg-secondary, #1e1e2e);
}

.column-filter-input {
  width: 100%;
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
}

.data-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border-light, #2a2a3a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary, #e0e0e0);
}

.data-table td.cell-wrap {
  white-space: normal;
  word-break: break-all;
  overflow: visible;
  text-overflow: unset;
  max-width: 400px;
  line-height: 1.4;
}

.data-table tbody tr:nth-child(even) {
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.02));
}

.data-table tbody tr:hover {
  background: var(--bg-hover, rgba(99, 130, 255, 0.08));
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #6c757d);
  font-size: 0.9rem;
}

.col-json {
  /* Tweak these to size the sticky JSON column and the { } button gap. */
  --json-col-width: 52px;
  --json-cell-pad-y: 0.2rem;
  --json-cell-pad-left: 0.15rem;
  --json-cell-pad-right: 0.15rem;
  --json-btn-margin-y: 0;
  --json-btn-margin-x: 0;

  position: sticky;
  left: 0;
  z-index: 3;
  box-sizing: border-box;
  width: var(--json-col-width);
  min-width: var(--json-col-width);
  max-width: var(--json-col-width);
  padding: var(--json-cell-pad-y) var(--json-cell-pad-right)
    var(--json-cell-pad-y) var(--json-cell-pad-left);
  text-align: center;
  box-shadow: 6px 0 8px -6px rgba(0, 0, 0, 0.45);
}

.data-table th.col-json,
.data-table td.col-json {
  position: sticky;
  left: 0;
  width: var(--json-col-width);
  min-width: var(--json-col-width);
  max-width: var(--json-col-width);
  padding: var(--json-cell-pad-y) var(--json-cell-pad-right)
    var(--json-cell-pad-y) var(--json-cell-pad-left);
}

.data-table .filter-row th.col-json {
  padding: 0.2rem var(--json-cell-pad-right) 0.2rem var(--json-cell-pad-left);
}

.data-table td.col-json {
  overflow: visible;
  white-space: nowrap;
  text-overflow: unset;
  background: var(--bg-primary, #141422);
}

.data-table tbody tr:nth-child(even) .col-json {
  background: #181828;
}

.data-table tbody tr:hover .col-json {
  background: #1c1c32;
}

.json-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: var(--json-btn-margin-y) var(--json-btn-margin-x);
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

.json-btn:hover:not(:disabled) {
  background: rgba(99, 226, 183, 0.22);
}

.json-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
