<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ProxyDetail } from "@/types";
import { useFormatters } from "@/composables/useFormatters";
import { api } from "@/api";

const props = defineProps<{
  scraperId: string;
  proxies: ProxyDetail[];
}>();

const emit = defineEmits<{
  (e: "proxyToggled", proxyId: string, enabled: boolean): void;
  (e: "refreshRequested"): void;
}>();

const { formatBytes } = useFormatters();

// Track which proxies are being toggled (loading state)
const togglingProxies = ref<Set<string>>(new Set());

// ==================== Row Selection ====================
const selectedProxyIds = ref<Set<string>>(new Set());
const showActionsMenu = ref(false);
const showResetAllConfirm = ref(false);

const allSelected = computed(() => {
  if (displayedProxies.value.length === 0) return false;
  return displayedProxies.value.every((p) =>
    selectedProxyIds.value.has(p.proxyId),
  );
});

const someSelected = computed(
  () => selectedProxyIds.value.size > 0 && !allSelected.value,
);

function toggleSelectAll() {
  if (allSelected.value) {
    selectedProxyIds.value.clear();
  } else {
    for (const p of displayedProxies.value) {
      selectedProxyIds.value.add(p.proxyId);
    }
  }
}

function toggleSelectRow(proxyId: string) {
  if (selectedProxyIds.value.has(proxyId)) {
    selectedProxyIds.value.delete(proxyId);
  } else {
    selectedProxyIds.value.add(proxyId);
  }
}

// ==================== Column Definitions ====================

interface ProxyColumn {
  key: string;
  label: string;
  defaultWidth?: number;
  sortable?: boolean;
  getValue: (row: ProxyDetail) => string;
  getSortValue?: (row: ProxyDetail) => number;
  cssClass?: (row: ProxyDetail) => string;
}

const allColumnDefs: ProxyColumn[] = [
  {
    key: "status",
    label: "Status",
    defaultWidth: 90,
    sortable: true,
    getSortValue: (row) => (row.inUse ? 2 : row.enabled ? 1 : 0),
    getValue: (row) => {
      if (!row.enabled) return "Disabled";
      if (row.inUse) return "In Use";
      if (row.consecutiveFailures > 3) return "Failing";
      return "Available";
    },
    cssClass: (row) => {
      if (!row.enabled) return "status-disabled";
      if (row.inUse) return "status-inuse";
      if (row.consecutiveFailures > 3) return "status-failing";
      return "status-available";
    },
  },
  {
    key: "provider",
    label: "Provider",
    defaultWidth: 100,
    sortable: true,
    getValue: (row) => row.provider || "-",
  },
  {
    key: "tier",
    label: "Tier",
    defaultWidth: 120,
    sortable: true,
    getValue: (row) => row.tier || "-",
  },
  {
    key: "proxyIp",
    label: "Proxy IP",
    defaultWidth: 150,
    sortable: true,
    getValue: (row) => row.proxyIp || "-",
  },
  {
    key: "login",
    label: "Login",
    defaultWidth: 120,
    sortable: true,
    getValue: (row) => row.login || "-",
    cssClass: (row) => (row.login ? "" : "text-muted"),
  },
  {
    key: "country",
    label: "Country",
    defaultWidth: 70,
    sortable: true,
    getValue: (row) => row.country || "-",
  },
  {
    key: "successRate",
    label: "Success Rate",
    defaultWidth: 100,
    sortable: true,
    getSortValue: (row) => (row.totalRequests === 0 ? -1 : row.successRate),
    getValue: (row) => {
      if (row.successRate < 0 || row.totalRequests === 0) return "-";
      return `${(row.successRate * 100).toFixed(1)}%`;
    },
    cssClass: (row) => {
      if (row.totalRequests === 0) return "text-muted";
      const pct = row.successRate * 100;
      if (pct > 90) return "text-success";
      if (pct > 70) return "text-warning";
      return "text-error";
    },
  },
  {
    key: "totalRequests",
    label: "Requests",
    defaultWidth: 85,
    sortable: true,
    getSortValue: (row) => row.totalRequests,
    getValue: (row) =>
      row.totalRequests === 0 ? "-" : row.totalRequests.toLocaleString(),
    cssClass: (row) => (row.totalRequests === 0 ? "text-muted" : ""),
  },
  {
    key: "successfulRequests",
    label: "Success",
    defaultWidth: 75,
    sortable: true,
    getSortValue: (row) => row.successfulRequests,
    getValue: (row) =>
      row.successfulRequests === 0
        ? "-"
        : row.successfulRequests.toLocaleString(),
    cssClass: (row) =>
      row.successfulRequests === 0 ? "text-muted" : "text-success",
  },
  {
    key: "failedRequests",
    label: "Failed",
    defaultWidth: 75,
    sortable: true,
    getSortValue: (row) => row.failedRequests,
    getValue: (row) =>
      row.failedRequests === 0 ? "-" : row.failedRequests.toLocaleString(),
    cssClass: (row) => (row.failedRequests === 0 ? "text-muted" : "text-error"),
  },
  {
    key: "blockedRequests",
    label: "Detections",
    defaultWidth: 80,
    sortable: true,
    getSortValue: (row) => row.blockedRequests ?? 0,
    getValue: (row) => {
      const n = row.blockedRequests ?? 0;
      return n === 0 ? "-" : n.toLocaleString();
    },
    cssClass: (row) =>
      (row.blockedRequests ?? 0) === 0 ? "text-muted" : "text-error",
  },
  {
    key: "avgResponseTimeMs",
    label: "Avg Time",
    defaultWidth: 85,
    sortable: true,
    getSortValue: (row) => row.avgResponseTimeMs,
    getValue: (row) => {
      if (row.totalRequests === 0 || row.avgResponseTimeMs <= 0) return "-";
      return `${row.avgResponseTimeMs.toFixed(0)}ms`;
    },
    cssClass: (row) =>
      row.totalRequests === 0 || row.avgResponseTimeMs <= 0 ? "text-muted" : "",
  },
  {
    key: "bytesDownloaded",
    label: "Downloaded",
    defaultWidth: 95,
    sortable: true,
    getSortValue: (row) => row.bytesDownloaded,
    getValue: (row) => {
      if (row.totalRequests === 0 || row.bytesDownloaded === 0) return "-";
      return formatBytes(row.bytesDownloaded);
    },
    cssClass: (row) =>
      row.totalRequests === 0 || row.bytesDownloaded === 0 ? "text-muted" : "",
  },
  {
    key: "selectionScore",
    label: "Score",
    defaultWidth: 70,
    sortable: true,
    getSortValue: (row) => row.selectionScore,
    getValue: (row) => {
      if (row.totalRequests === 0) return "-";
      return row.selectionScore.toFixed(0);
    },
    cssClass: (row) => {
      if (row.totalRequests === 0) return "text-muted";
      if (row.selectionScore > 100) return "text-success";
      if (row.selectionScore > 50) return "";
      return "text-warning";
    },
  },
  {
    key: "currentWorkerId",
    label: "Worker",
    defaultWidth: 90,
    sortable: true,
    getValue: (row) => row.currentWorkerId || "-",
    cssClass: (row) => (row.currentWorkerId ? "" : "text-muted"),
  },
  {
    key: "lastUsed",
    label: "Last Used",
    defaultWidth: 110,
    sortable: true,
    getSortValue: (row) =>
      row.lastUsed ? new Date(row.lastUsed).getTime() : 0,
    getValue: (row) => {
      if (!row.lastUsed) return "-";
      const date = new Date(row.lastUsed);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return date.toLocaleDateString();
    },
    cssClass: (row) => (!row.lastUsed ? "text-muted" : ""),
  },
];

// ==================== Column Management (Data-tab style) ====================

interface ColumnPrefs {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

const columnPrefs = ref<ColumnPrefs>({ order: [], hidden: [], widths: {} });
const columnFilters = ref<Record<string, string>>({});
const showColumnMenu = ref(false);
const draggedColumn = ref<string | null>(null);
const prefsLoaded = ref(false);

// Sort state
const sortKey = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("desc");

function prefKey(): string {
  return `proxyTable:${props.scraperId}`;
}

function readStoredPrefs(key: string): ColumnPrefs | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ColumnPrefs) : null;
  } catch {
    return null;
  }
}

const allColumnKeys = computed(() => allColumnDefs.map((c) => c.key));

function getPrefs(): ColumnPrefs {
  return columnPrefs.value;
}

const visibleColumns = computed(() => {
  const prefs = getPrefs();
  const all = allColumnKeys.value;
  const ordered: string[] = [];
  for (const col of prefs.order) {
    if (all.includes(col)) ordered.push(col);
  }
  for (const col of all) {
    if (!ordered.includes(col)) ordered.push(col);
  }
  return ordered
    .filter((c) => !prefs.hidden.includes(c))
    .map((key) => allColumnDefs.find((d) => d.key === key)!)
    .filter(Boolean);
});

// Sorted and filtered proxy rows — always "In Use" on top
const displayedProxies = computed(() => {
  let rows = [...props.proxies];

  // Apply column filters
  for (const [col, query] of Object.entries(columnFilters.value)) {
    if (!query) continue;
    const q = query.toLowerCase();
    const def = allColumnDefs.find((d) => d.key === col);
    if (!def) continue;
    rows = rows.filter((row) => def.getValue(row).toLowerCase().includes(q));
  }

  // Apply user sort
  if (sortKey.value) {
    const def = allColumnDefs.find((d) => d.key === sortKey.value);
    if (def) {
      const getSv = def.getSortValue || ((r: ProxyDetail) => def.getValue(r));
      rows.sort((a, b) => {
        const av = getSv(a);
        const bv = getSv(b);
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir.value === "asc" ? av - bv : bv - av;
        }
        const as = String(av);
        const bs = String(bv);
        return sortDir.value === "asc"
          ? as.localeCompare(bs)
          : bs.localeCompare(as);
      });
    }
  } else {
    // Default sort: by score descending
    rows.sort((a, b) => b.selectionScore - a.selectionScore);
  }

  // Always keep "In Use" proxies on top (stable partition)
  const inUse = rows.filter((r) => r.inUse);
  const notInUse = rows.filter((r) => !r.inUse);
  return [...inUse, ...notInUse];
});

function toggleSort(key: string) {
  if (sortKey.value === key) {
    if (sortDir.value === "desc") {
      sortDir.value = "asc";
    } else {
      // Third click: clear sort
      sortKey.value = null;
      sortDir.value = "desc";
    }
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}

function sortIndicator(key: string): string {
  if (sortKey.value !== key) return "";
  return sortDir.value === "asc" ? " ▲" : " ▼";
}

// ==================== Column visibility ====================

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

// ==================== Drag & drop reorder ====================

function onDragStart(col: string) {
  draggedColumn.value = col;
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
}

function onDrop(col: string) {
  if (!draggedColumn.value || draggedColumn.value === col) return;
  const prefs = getPrefs();
  if (prefs.order.length === 0) {
    prefs.order = [...allColumnKeys.value];
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

// ==================== Column resize ====================

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

function getColumnWidth(col: ProxyColumn): string {
  const w = getPrefs().widths[col.key];
  return w ? `${w}px` : col.defaultWidth ? `${col.defaultWidth}px` : "auto";
}

// ==================== Persistence ====================

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function savePrefsDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(prefKey(), JSON.stringify(getPrefs()));
    } catch (err) {
      console.error("Failed to save proxy table prefs:", err);
    }
  }, 500);
}

async function loadPrefs() {
  const saved = readStoredPrefs(prefKey());
  if (saved) {
    columnPrefs.value = saved;
  }
  prefsLoaded.value = true;
}

function resetPrefs() {
  columnPrefs.value = { order: [], hidden: [], widths: {} };
  columnFilters.value = {};
  sortKey.value = null;
  sortDir.value = "desc";
  savePrefsDebounced();
}

// ==================== Toggle proxy ====================

async function toggleProxy(proxyId: string, newEnabled: boolean) {
  togglingProxies.value.add(proxyId);
  try {
    await api.sendCommand(
      props.scraperId,
      "SET_PROXY_ENABLED",
      undefined,
      undefined,
      { proxyId, enabled: newEnabled },
    );
    emit("proxyToggled", proxyId, newEnabled);
  } catch {
    // silent
  } finally {
    togglingProxies.value.delete(proxyId);
  }
}

// ==================== Bulk Actions ====================

async function enableSelected() {
  for (const proxyId of selectedProxyIds.value) {
    const proxy = props.proxies.find((p) => p.proxyId === proxyId);
    if (proxy && !proxy.enabled) {
      await toggleProxy(proxyId, true);
    }
  }
  showActionsMenu.value = false;
}

async function disableSelected() {
  for (const proxyId of selectedProxyIds.value) {
    const proxy = props.proxies.find((p) => p.proxyId === proxyId);
    if (proxy && proxy.enabled) {
      await toggleProxy(proxyId, false);
    }
  }
  showActionsMenu.value = false;
}

async function resetStatsSelected() {
  if (selectedProxyIds.value.size === 0) return;
  try {
    await api.sendCommand(
      props.scraperId,
      "RESET_PROXY_STATS",
      undefined,
      undefined,
      { proxyIds: Array.from(selectedProxyIds.value) },
    );
    emit("refreshRequested");
  } catch {
    // silent
  }
  showActionsMenu.value = false;
}

async function refreshAll() {
  try {
    await api.sendCommand(props.scraperId, "FORCE_HEALTH_REPORT");
    // Wait for the scraper to process the command and send HealthMessage via WebSocket.
    // The store updates reactively from WebSocket HEALTH_UPDATE, but also reload as fallback.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    emit("refreshRequested");
  } catch {
    // silent
  }
  showActionsMenu.value = false;
}

async function resetAll() {
  showResetAllConfirm.value = false;
  showActionsMenu.value = false;
  try {
    await api.sendCommand(
      props.scraperId,
      "RESET_ALL_PROXY_STATS" as import("@/types").CommandType,
    );
    emit("refreshRequested");
  } catch {
    // silent
  }
}

function confirmResetAll() {
  showResetAllConfirm.value = true;
  showActionsMenu.value = false;
}

// ==================== Lifecycle ====================

onMounted(() => {
  loadPrefs();
});
</script>

<template>
  <div class="proxy-table-container">
    <!-- Toolbar -->
    <div class="proxy-toolbar">
      <div class="proxy-stats">
        <span class="stat"
          ><strong>Showing:</strong> {{ displayedProxies.length }} proxies</span
        >
        <span v-if="displayedProxies.length !== proxies.length" class="stat">
          <strong>Filtered:</strong> {{ displayedProxies.length }} /
          {{ proxies.length }}
        </span>
      </div>
      <div class="proxy-actions">
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
              v-for="col in allColumnDefs"
              :key="col.key"
              class="column-menu-item"
            >
              <input
                type="checkbox"
                :checked="isColumnVisible(col.key)"
                @change="toggleColumnVisibility(col.key)"
              />
              {{ col.label }}
            </label>
          </div>
        </div>

        <!-- Actions dropdown -->
        <div class="column-menu-wrapper">
          <button
            class="btn btn-sm btn-secondary"
            @click="showActionsMenu = !showActionsMenu"
            title="Bulk actions on proxies"
          >
            Actions ▾
          </button>
          <div
            v-if="showActionsMenu"
            class="column-menu actions-menu"
            @mouseleave="showActionsMenu = false"
          >
            <div class="column-menu-header">
              <span>Actions</span>
              <span v-if="selectedProxyIds.size > 0" class="selected-label"
                >{{ selectedProxyIds.size }} selected</span
              >
            </div>
            <button
              class="action-menu-item"
              :disabled="selectedProxyIds.size === 0"
              @click="enableSelected"
            >
              ✓ Enable
            </button>
            <button
              class="action-menu-item"
              :disabled="selectedProxyIds.size === 0"
              @click="disableSelected"
            >
              ✕ Disable
            </button>
            <button
              class="action-menu-item"
              :disabled="selectedProxyIds.size === 0"
              @click="resetStatsSelected"
            >
              ↺ Reset Stats
            </button>
            <div class="action-menu-divider" />
            <button class="action-menu-item" @click="refreshAll">
              ⟳ Refresh All
            </button>
            <button
              class="action-menu-item action-danger"
              @click="confirmResetAll"
            >
              ⚠ Reset All
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset All Confirmation Modal -->
    <div
      v-if="showResetAllConfirm"
      class="modal-overlay"
      @click.self="showResetAllConfirm = false"
    >
      <div class="modal-dialog">
        <h4 class="modal-title">⚠ Reset All Proxy Statistics</h4>
        <p class="modal-message">
          This will completely clear the proxy_statistics table for this
          scraper. All proxy metrics will be reset to zero. This cannot be
          undone.
        </p>
        <div class="modal-actions">
          <button
            class="btn btn-sm btn-secondary"
            @click="showResetAllConfirm = false"
          >
            Cancel
          </button>
          <button class="btn btn-sm btn-danger" @click="resetAll">
            Confirm Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="proxy-table-wrapper">
      <table v-if="proxies.length > 0" class="proxy-table">
        <thead>
          <tr>
            <!-- Selection checkbox column -->
            <th class="th-select" style="width: 36px">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="toggleSelectAll"
              />
            </th>
            <!-- Enabled status column (icon, no checkbox) -->
            <th class="th-enabled" style="width: 60px">Enabled</th>
            <th
              v-for="col in visibleColumns"
              :key="col.key"
              :style="{ width: getColumnWidth(col) }"
              draggable="true"
              @dragstart="onDragStart(col.key)"
              @dragover="onDragOver"
              @drop="onDrop(col.key)"
              @dragend="onDragEnd"
              :class="{
                'drag-over': draggedColumn && draggedColumn !== col.key,
                sortable: col.sortable,
              }"
              @click="col.sortable ? toggleSort(col.key) : undefined"
            >
              <span class="th-content"
                >{{ col.label }}{{ sortIndicator(col.key) }}</span
              >
              <span
                class="resize-handle"
                @mousedown.stop="(e) => startResize(e, col.key)"
                @click.stop
              ></span>
            </th>
          </tr>
          <!-- Filter row -->
          <tr class="filter-row">
            <th></th>
            <th></th>
            <th v-for="col in visibleColumns" :key="'filter-' + col.key">
              <input
                v-model="columnFilters[col.key]"
                type="text"
                class="column-filter-input"
                placeholder="Filter..."
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in displayedProxies"
            :key="row.proxyId"
            :class="{
              'row-inuse': row.inUse,
              'row-disabled': !row.enabled,
              'row-selected': selectedProxyIds.has(row.proxyId),
            }"
          >
            <!-- Selection checkbox -->
            <td class="td-select">
              <input
                type="checkbox"
                :checked="selectedProxyIds.has(row.proxyId)"
                @change="toggleSelectRow(row.proxyId)"
              />
            </td>
            <!-- Enabled status icon -->
            <td class="td-enabled">
              <span
                v-if="row.enabled"
                class="enabled-icon enabled-yes"
                title="Enabled"
                >✓</span
              >
              <span v-else class="enabled-icon enabled-no" title="Disabled"
                >✕</span
              >
            </td>
            <td
              v-for="col in visibleColumns"
              :key="col.key"
              :style="{ width: getColumnWidth(col) }"
              :class="col.cssClass ? col.cssClass(row) : ''"
              :title="col.getValue(row)"
            >
              {{ col.getValue(row) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">
        <p>No proxy data available.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.proxy-table-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.proxy-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
}

.proxy-stats {
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
}

.proxy-actions {
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

.btn-secondary {
  background: var(--bg-tertiary, #2a2a3a);
  color: var(--text-primary, #e0e0e0);
}

.btn-secondary:hover {
  background: var(--bg-quaternary, #3a3a4a);
}

.btn-link {
  background: none;
  border: none;
  color: #63e2b7;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.btn-link:hover {
  text-decoration: underline;
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
  accent-color: #63e2b7;
}

/* Table */
.proxy-table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
}

.proxy-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  table-layout: fixed;
}

.proxy-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.proxy-table th {
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
  min-width: 40px;
  position: relative;
  user-select: none;
}

.th-enabled {
  text-align: center;
}

.th-select {
  text-align: center;
}

.td-select {
  text-align: center;
}

.td-select input[type="checkbox"] {
  accent-color: #63e2b7;
  cursor: pointer;
}

.th-select input[type="checkbox"] {
  accent-color: #63e2b7;
  cursor: pointer;
}

.th-content {
  cursor: grab;
}

.th-content:active {
  cursor: grabbing;
}

.sortable {
  cursor: pointer;
}

.sortable:hover {
  color: #63e2b7;
}

.drag-over {
  border-left: 2px solid #63e2b7;
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
  background: #63e2b7;
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
  border-color: #63e2b7;
}

.column-filter-input::placeholder {
  color: var(--text-tertiary, #555);
}

/* Rows */
.proxy-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border-light, #2a2a3a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary, #e0e0e0);
}

.td-enabled {
  text-align: center;
}

.enabled-icon {
  font-size: 1rem;
  font-weight: 700;
}

.enabled-yes {
  color: #63e2b7;
}

.enabled-no {
  color: #e88080;
}

.row-selected {
  background: rgba(99, 226, 184, 0.08) !important;
}

.proxy-table tbody tr:nth-child(even) {
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.02));
}

.proxy-table tbody tr:hover {
  background: var(--bg-hover, rgba(99, 130, 255, 0.08));
}

.row-inuse {
  background: rgba(99, 226, 184, 0.136) !important;
}

.row-disabled td {
  opacity: 0.5;
}

/* Status cell colors — use .proxy-table td. prefix for specificity over .proxy-table td */
.proxy-table td.status-inuse {
  color: #63e2b7;
  font-weight: 600;
}

.proxy-table td.status-available {
  color: rgba(255, 255, 255, 0.65);
}

.proxy-table td.status-failing {
  color: #e88080;
  font-weight: 600;
}

.proxy-table td.status-disabled {
  color: rgba(255, 255, 255, 0.35);
}

/* Metric colors */
.proxy-table td.text-success {
  color: #63e2b7;
}

.proxy-table td.text-warning {
  color: #f2c97d;
}

.proxy-table td.text-error {
  color: #e88080;
}

.proxy-table td.text-muted {
  color: rgba(255, 255, 255, 0.3);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.9rem;
}

/* Actions menu */
.actions-menu {
  min-width: 160px;
}

.action-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.75rem;
  background: none;
  border: none;
  color: var(--text-primary, #e0e0e0);
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 3px;
}

.action-menu-item:hover:not(:disabled) {
  background: var(--bg-hover, rgba(99, 130, 255, 0.08));
}

.action-menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-menu-item.action-danger {
  color: #e88080;
}

.action-menu-item.action-danger:hover:not(:disabled) {
  background: rgba(232, 128, 128, 0.1);
}

.action-menu-divider {
  height: 1px;
  background: var(--border-color, #333);
  margin: 0.25rem 0;
}

.selected-label {
  font-size: 0.7rem;
  color: #63e2b7;
}

/* Confirmation modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.modal-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  color: #f2c97d;
}

.modal-message {
  margin: 0 0 1.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-danger {
  background: rgba(232, 128, 128, 0.2);
  color: #e88080;
  border: 1px solid rgba(232, 128, 128, 0.3);
}

.btn-danger:hover {
  background: rgba(232, 128, 128, 0.3);
}
</style>
