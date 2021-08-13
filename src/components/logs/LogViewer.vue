<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { MAX_LOGS_IN_MEMORY, useLogsStore } from "@/stores/logs";
import { useFormatters } from "@/composables/useFormatters";
import { useThrottleFn } from "@vueuse/core";
import { logGroupTitle } from "@/composables/usePhases";
import { groupLogs } from "./logGroups";
import type { DisplayEntry } from "./logGroups";

// Module-level map to persist scroll positions across component mount/unmount cycles
const savedScrollPositions = new Map<string, number>();

const props = withDefaults(
  defineProps<{
    scraperId: string;
    workerId?: string;
    maxHeight?: number;
    /** Whether to automatically initialize logs (trigger FETCH_LOGS) on mount. Default true. Set false for Dashboard preview. */
    autoInitialize?: boolean;
    /** Whether to fill available height instead of using fixed maxHeight. Default false. */
    fillHeight?: boolean;
  }>(),
  {
    autoInitialize: true,
    fillHeight: false,
  },
);

const logsStore = useLogsStore();
const { formatTimestamp } = useFormatters();

const containerRef = ref<HTMLElement | null>(null);
const autoScroll = ref(true);
const searchQuery = ref("");
const activeLevels = ref<Set<string>>(
  new Set(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]),
);
const showLevelMenu = ref(false);
const loading = ref(false);
const paginationLoading = ref(false);

const allLevels = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

// Set up store selection
watch(
  () => [props.scraperId, props.workerId],
  () => {
    logsStore.setSelection(props.scraperId, props.workerId || null);
  },
  { immediate: true },
);

// Get raw logs from store and apply local filtering
const rawLogs = computed(() => logsStore.getLogsForScraper(props.scraperId));

// Apply filters locally - logs are stored oldest-first, we reverse for display (newest-first)
const filteredLogs = computed(() => {
  let logs = [...rawLogs.value];

  // Scope routing: main view hides WORKER-only; worker view hides MAIN-only
  if (props.workerId) {
    logs = logs.filter(
      (l) => l.workerId === props.workerId && visibleInWorker(l.scope),
    );
  } else {
    logs = logs.filter((l) => visibleInMain(l.scope));
  }

  // Filter by exact level (multi-select)
  if (activeLevels.value.size < allLevels.length) {
    logs = logs.filter((l) => activeLevels.value.has(l.level));
  }

  // NOTE: search filtering is applied AFTER grouping in displayEntries
  // to preserve parse group structure when searching within groups.

  // Reverse for display: newest logs first (logs are stored oldest-first)
  return logs.reverse();
});

// End of the file, or enough lines on screen. Either way, stop and say so.
// Hidden worker lines do not count toward the on-screen limit.
const maxLogsReached = computed(
  () =>
    logsStore.paginationComplete.has(props.scraperId) ||
    filteredLogs.value.length >= MAX_LOGS_IN_MEMORY,
);

// ==================== Log group detection ====================
// Groups logs between [<KIND>_GROUP_START:id|detail] / [<KIND>_GROUP_END:id] markers
// into collapsible entries (see logGroups.ts).

// Track which groups are expanded
const expandedGroups = ref<Set<string>>(new Set());

function toggleGroup(groupKey: string) {
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey);
  } else {
    expandedGroups.value.add(groupKey);
  }
}

function onGroupHeaderClick(event: MouseEvent, groupKey: string) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".log-group-url")) {
    return;
  }
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    return;
  }
  toggleGroup(groupKey);
}

/** Obey scraper-stamped scope; missing scope = legacy BOTH. */
function visibleInMain(scope: string | undefined): boolean {
  return !scope || scope === "MAIN" || scope === "BOTH";
}

function visibleInWorker(scope: string | undefined): boolean {
  return !scope || scope === "WORKER" || scope === "BOTH";
}

// Process filteredLogs into display entries with grouped logs.
// filteredLogs is newest-first, so we group oldest-first (to find START→END pairs), then reverse back.
// Search filtering is applied AFTER grouping so that groups whose children match are preserved.
const displayEntries = computed<DisplayEntry[]>(() => {
  const logs = filteredLogs.value;
  if (logs.length === 0) return [];

  const oldestFirst = [...logs].reverse();
  const result = groupLogs(oldestFirst, (kind) => logGroupTitle(kind));

  // Reverse back to newest-first for display
  const entries = result.reverse();

  // Apply search filter AFTER grouping to preserve group structure
  if (!searchQuery.value) return entries;

  const search = searchQuery.value.toLowerCase();
  const filtered: DisplayEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "single") {
      const log = entry.log;
      if (
        log.message.toLowerCase().includes(search) ||
        log.logger?.toLowerCase().includes(search) ||
        log.context?.toLowerCase().includes(search)
      ) {
        filtered.push(entry);
      }
    } else {
      // Group: keep if id, url, title or any child log matches
      const groupMatches =
        entry.id.toLowerCase().includes(search) ||
        entry.url.toLowerCase().includes(search) ||
        entry.title.toLowerCase().includes(search);
      const matchingLogs = entry.logs.filter(
        (l) =>
          l.message.toLowerCase().includes(search) ||
          l.logger?.toLowerCase().includes(search) ||
          l.context?.toLowerCase().includes(search),
      );

      if (groupMatches || matchingLogs.length > 0) {
        // Auto-expand group when search matches children (not the group header itself)
        if (matchingLogs.length > 0 && !groupMatches) {
          expandedGroups.value.add(entry.key);
        }
        filtered.push(entry);
      }
    }
  }

  return filtered;
});

// ==================== URL Extraction for Log Messages ====================
// Detects URLs in log messages and splits them into text + URL parts
// so the URL can be rendered on a separate expandable line.

const URL_RE = /(https?:\/\/[^\s<>"']+)/;

function splitMessageUrl(message: string): {
  text: string;
  url: string | null;
} {
  const match = message.match(URL_RE);
  if (!match) return { text: message, url: null };

  const url = match[1].replace(/[),.;!?]+$/, "");
  // Remove the URL from the message text, clean up trailing separators
  let text = message
    .replace(url, "")
    .replace(/\s*--\s*Url:\s*$/, "")
    .replace(/\s*--\s*$/, "")
    .trimEnd();
  return { text, url };
}

// Track which single-log entries have their URL expanded (by log id)
const expandedUrls = ref<Set<string>>(new Set());

function toggleUrlExpand(logId: string) {
  if (expandedUrls.value.has(logId)) {
    expandedUrls.value.delete(logId);
  } else {
    expandedUrls.value.add(logId);
  }
}

// Throttled scroll to top (newest logs are on top)
const scrollToTop = useThrottleFn(() => {
  if (autoScroll.value && containerRef.value) {
    nextTick(() => {
      const el = containerRef.value;
      if (el) {
        el.scrollTop = 0;
      }
    });
  }
}, 100);

// Watch for new logs and scroll to top. If the user is still at the bottom
// after an older page arrives, ask for the next page without another flick.
watch(
  () => filteredLogs.value.length,
  async (len, prev) => {
    scrollToTop();
    if (autoScroll.value || !stickToBottom || len <= (prev ?? 0)) return;
    await nextTick();
    const el = containerRef.value;
    if (el && distanceFromBottom(el) < BOTTOM_GAP_PX) {
      fetchOlderLogsIfNeeded();
    }
  },
);

/**
 * Initialize logs for this scraper if not already done.
 * This triggers FETCH_LOGS to get historical logs from the scraper.
 * Only called on first visit to Logs tab after scraper registration.
 *
 * Always checks with Manager for initialization state to handle:
 * - Manager restarts (Manager not initialized, but UI might have local state)
 * - Scraper reconnection (Manager reset initialization, UI should respect that)
 */
async function initializeLogsIfNeeded() {
  loading.value = true;
  try {
    // Always delegate to store which will check with Manager
    await logsStore.initializeLogs(props.scraperId);
  } finally {
    loading.value = false;
  }
}

// Clear logs from Manager memory only (does not re-trigger FETCH_LOGS)
async function clearLogs() {
  await logsStore.clearLogs(props.scraperId, props.workerId);
}

// Refresh = tell Manager to clear logs and re-fetch from scraper
async function refreshLogs() {
  loading.value = true;
  try {
    await logsStore.refreshLogs(props.scraperId);
  } finally {
    loading.value = false;
  }
}

// Short debounce after a request is actually sent. A scroll that finds a page
// already in flight does not start this, so the next real gesture is not lost.
let paginationCooldownUntil = 0;
const PAGINATION_COOLDOWN_MS = 400;
const BOTTOM_GAP_PX = 160;
let stickToBottom = false;

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function oldestSequence(): number | null {
  let oldest = Infinity;
  for (const log of rawLogs.value) {
    if (log.sequence != null && log.sequence < oldest) oldest = log.sequence;
  }
  return Number.isFinite(oldest) ? oldest : null;
}

async function fetchOlderLogsIfNeeded() {
  if (paginationLoading.value) return;
  if (maxLogsReached.value) return;
  if (Date.now() < paginationCooldownUntil) return;

  const cursor = oldestSequence();
  paginationLoading.value = true;
  try {
    const result = await logsStore.fetchOlderLogs(props.scraperId);
    if (!result.success) return;
    paginationCooldownUntil = Date.now() + PAGINATION_COOLDOWN_MS;
    // REST only queues the read. Keep the indicator until those lines arrive.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (maxLogsReached.value) break;
      const now = oldestSequence();
      if (cursor != null && now != null && now < cursor) break;
    }
  } finally {
    paginationLoading.value = false;
  }

  const el = containerRef.value;
  if (
    stickToBottom &&
    el &&
    distanceFromBottom(el) < BOTTOM_GAP_PX &&
    !maxLogsReached.value
  ) {
    fetchOlderLogsIfNeeded();
  }
}

function handleScroll(e: Event) {
  const target = e.target as HTMLElement;

  // Auto-scroll activates when at TOP (newest logs are on top).
  // The lines already loaded stay put until Clear or Refresh.
  const isAtTop = target.scrollTop < 50;
  autoScroll.value = isAtTop;

  // Older lines are at the bottom. A generous gap so the end of a scroll counts.
  const atBottom = distanceFromBottom(target) < BOTTOM_GAP_PX;
  stickToBottom = atBottom && !isAtTop;

  if (atBottom) {
    fetchOlderLogsIfNeeded();
  }
}

function toggleAutoScroll() {
  autoScroll.value = !autoScroll.value;
  // When turning auto-scroll ON, scroll to top immediately
  if (autoScroll.value && containerRef.value) {
    containerRef.value.scrollTop = 0;
  }
}

onMounted(() => {
  // Only initialize logs if autoInitialize is true (not for Dashboard preview)
  if (props.autoInitialize) {
    initializeLogsIfNeeded();
  }
  // Restore saved scroll position after logs render
  const scrollKey = `${props.scraperId}:${props.workerId || ""}`;
  const savedPos = savedScrollPositions.get(scrollKey);
  if (savedPos !== undefined && savedPos > 0) {
    // Wait for logs to render, then restore position
    nextTick(() => {
      setTimeout(() => {
        if (containerRef.value) {
          containerRef.value.scrollTop = savedPos;
          autoScroll.value = savedPos < 50;
        }
      }, 50);
    });
  }
});

onBeforeUnmount(() => {
  // Save scroll position before unmount
  const scrollKey = `${props.scraperId}:${props.workerId || ""}`;
  if (containerRef.value) {
    savedScrollPositions.set(scrollKey, containerRef.value.scrollTop);
  }
});
</script>

<template>
  <div class="log-viewer-container">
    <!-- Logs Toolbar -->
    <div class="logs-toolbar">
      <!-- Search Input -->
      <div class="search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search logs..."
          class="logs-search-input"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="clear-search-btn"
          title="Clear search"
        >
          ×
        </button>
      </div>

      <!-- Level Filter (multi-select checkboxes) -->
      <div class="level-filter-wrapper">
        <button
          class="logs-level-filter-btn"
          @click="showLevelMenu = !showLevelMenu"
        >
          Levels ({{ activeLevels.size }}/{{ allLevels.length }}) ▾
        </button>
        <div
          v-if="showLevelMenu"
          class="level-filter-menu"
          @mouseleave="showLevelMenu = false"
        >
          <label
            v-for="level in allLevels"
            :key="level"
            class="level-filter-item"
          >
            <input
              type="checkbox"
              :checked="activeLevels.has(level)"
              @change="
                activeLevels.has(level)
                  ? activeLevels.delete(level)
                  : activeLevels.add(level)
              "
            />
            <span
              class="log-level"
              :class="`log-level-${level.toLowerCase()}`"
              >{{ level }}</span
            >
          </label>
        </div>
      </div>

      <div class="toolbar-spacer" />

      <!-- Action Buttons -->
      <button
        @click="refreshLogs"
        :disabled="loading"
        class="toolbar-btn logs-refresh-btn"
        title="Refresh logs from scraper"
      >
        {{ loading ? "Loading..." : "Refresh" }}
      </button>
      <button
        @click="clearLogs"
        class="toolbar-btn logs-clear-btn"
        title="Clear logs from memory"
      >
        Clear
      </button>
      <button
        @click="toggleAutoScroll"
        :class="['toolbar-btn', 'logs-autoscroll-btn', { active: autoScroll }]"
        title="Toggle auto-scroll to newest logs"
      >
        {{ autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF" }}
      </button>
    </div>

    <!-- Logs List Container -->
    <div ref="containerRef" class="logs-list-container" @scroll="handleScroll">
      <div v-if="loading" class="logs-loading-state">Loading...</div>
      <div v-else-if="filteredLogs.length === 0" class="logs-empty-state">
        No logs found
      </div>
      <div v-else class="logs-entries">
        <template v-for="(entry, idx) in displayEntries" :key="idx">
          <!-- idx is the row key; the check keeps the binding visible to vue-tsc -->
          <template v-if="idx < 0" />
          <!-- Grouped parse logs -->
          <div v-if="entry.type === 'group'" class="log-group">
            <div class="log-group-header" @click="onGroupHeaderClick($event, entry.key)">
              <span
                class="log-group-toggle"
                title="Expand / collapse"
                >{{
                expandedGroups.has(entry.key) ? "▼" : "▶"
              }}</span>
              <span class="log-timestamp">{{
                formatTimestamp(entry.timestamp)
              }}</span>
              <span class="log-level log-level-info">{{ entry.kind }}</span>
              <span v-if="entry.workerId" class="log-worker-id">{{
                entry.workerId
              }}</span>
              <span class="log-group-summary">
                {{ entry.title }}
                <span class="log-group-count"
                  >({{ entry.logs.length }} logs)</span
                >
                <span
                  v-if="entry.hasErrors"
                  class="log-group-badge log-group-badge-error"
                  >ERRORS</span
                >
                <span
                  v-else-if="entry.hasWarns"
                  class="log-group-badge log-group-badge-warn"
                  >WARNS</span
                >
              </span>
              <span
                v-if="entry.url"
                class="log-group-url"
                @click.stop
                :title="entry.url"
                >{{ entry.url }}</span
              >
            </div>
            <div
              v-if="expandedGroups.has(entry.key)"
              class="log-group-body"
            >
              <div
                v-for="log in entry.logs"
                :key="log.id"
                class="log-entry log-entry-grouped"
              >
                <span class="log-timestamp">{{
                  formatTimestamp(log.timestamp)
                }}</span>
                <span
                  class="log-level"
                  :class="`log-level-${log.level.toLowerCase()}`"
                  >{{ log.level }}</span
                >
                <span
                  class="log-message"
                  :class="`log-message-${log.level.toLowerCase()}`"
                  >{{ log.message }}</span
                >
              </div>
            </div>
          </div>
          <!-- Single log entry -->
          <div
            v-else
            class="log-entry"
            :class="{
              'log-entry-has-url': splitMessageUrl(entry.log.message).url,
            }"
            :key="entry.log.id"
          >
            <div
              class="log-entry-header"
              @click="
                splitMessageUrl(entry.log.message).url
                  ? toggleUrlExpand(entry.log.id)
                  : undefined
              "
            >
              <span class="log-timestamp">{{
                formatTimestamp(entry.log.timestamp)
              }}</span>
              <span
                class="log-level"
                :class="`log-level-${entry.log.level.toLowerCase()}`"
                >{{ entry.log.level }}</span
              >
              <span v-if="entry.log.workerId" class="log-worker-id">{{
                entry.log.workerId
              }}</span>
              <span
                class="log-message"
                :class="`log-message-${entry.log.level.toLowerCase()}`"
                >{{ splitMessageUrl(entry.log.message).text }}</span
              >
              <span
                v-if="splitMessageUrl(entry.log.message).url"
                class="log-url-indicator"
                :class="{ expanded: expandedUrls.has(entry.log.id) }"
                >{{ expandedUrls.has(entry.log.id) ? "▾ URL" : "▸ URL" }}</span
              >
            </div>
            <div
              v-if="
                splitMessageUrl(entry.log.message).url &&
                expandedUrls.has(entry.log.id)
              "
              class="log-url-line"
              @click.stop
            >
              <span class="log-url">{{
                splitMessageUrl(entry.log.message).url
              }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Pagination indicator at bottom -->
      <div v-if="paginationLoading" class="pagination-indicator">
        Loading older logs...
      </div>
      <div v-else-if="maxLogsReached" class="pagination-indicator max-reached">
        Maximum amount of log records reached to show in UI
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   LOG VIEWER CONTAINER
   ============================================ */
.log-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ============================================
   LOGS TOOLBAR
   ============================================ */
.logs-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #18181c;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Search Input */
.search-input-wrapper {
  position: relative;
  width: 200px;
}

.logs-search-input {
  width: 100%;
  height: 28px;
  padding: 0 28px 0 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid transparent;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.logs-search-input::placeholder {
  color: rgba(255, 255, 255, 0.38);
}

.logs-search-input:hover {
  border-color: #7fe7c4;
  background: rgba(255, 255, 255, 0.12);
}

.logs-search-input:focus {
  border-color: #7fe7c4;
  background: rgba(99, 226, 183, 0.1);
  box-shadow: 0 0 8px 0 rgba(99, 226, 183, 0.3);
}

.clear-search-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  padding: 0;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-search-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.9);
}

/* Level Filter (multi-select dropdown) */
.level-filter-wrapper {
  position: relative;
}

.logs-level-filter-btn {
  height: 28px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid transparent;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.logs-level-filter-btn:hover {
  border-color: #7fe7c4;
  background-color: rgba(255, 255, 255, 0.12);
}

.level-filter-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: #1e1e22;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 130px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.level-filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 13px;
}

.level-filter-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.level-filter-item input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

.toolbar-spacer {
  flex: 1;
}

/* Toolbar Buttons */
.toolbar-btn {
  height: 28px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid transparent;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
}

.toolbar-btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(1px);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Refresh Button */
.logs-refresh-btn:hover:not(:disabled) {
  background: rgba(99, 226, 183, 0.15);
  border-color: #63e2b7;
  color: #7fe7c4;
}

/* Clear Button */
.logs-clear-btn:hover:not(:disabled) {
  background: rgba(242, 201, 125, 0.15);
  border-color: #f2c97d;
  color: #f5d599;
}

/* Auto-scroll Button */
.logs-autoscroll-btn.active {
  background: rgba(99, 226, 183, 0.15);
  border-color: #63e2b7;
  color: #7fe7c4;
}

.logs-autoscroll-btn.active:hover {
  background: rgba(99, 226, 183, 0.2);
  border-color: #7fe7c4;
}

/* ============================================
   LOGS LIST CONTAINER - MUST SCROLL
   ============================================ */
.logs-list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #0d0d0f;
  border-radius: 4px;
  padding: 8px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
}

/* Loading/Empty States */
.logs-loading-state,
.logs-empty-state {
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-family: inherit;
  font-size: 16px;
}

/* ============================================
   LOG ENTRIES
   ============================================ */
.logs-entries {
  /*display: flex;*/
  flex-direction: column;
  gap: 4px;
}

.log-entry {
  border-radius: 3px;
  transition: background 0.15s;
}

.log-entry-header {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 8px;
}

.log-entry:hover {
  background: #1a1a1e;
}

/* Log Timestamp */
.log-timestamp {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 140px;
}

/* Log Level Badge */
.log-level {
  flex-shrink: 0;
  min-width: 50px;
  text-align: center;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid;
}

.log-level-trace,
.log-level-debug {
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
  border-color: rgba(255, 255, 255, 0.15);
}

.log-level-info {
  color: #70c0e8;
  background: rgba(112, 192, 232, 0.1);
  border-color: rgba(112, 192, 232, 0.3);
}

.log-level-warn {
  color: #f2c97d;
  background: rgba(242, 201, 125, 0.1);
  border-color: rgba(242, 201, 125, 0.3);
}

.log-level-error,
.log-level-fatal {
  color: #e88080;
  background: rgba(232, 128, 128, 0.1);
  border-color: rgba(232, 128, 128, 0.3);
}

/* Log Worker ID */
.log-worker-id {
  flex-shrink: 0;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-family: monospace;
}

/* Log Message */
.log-message {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
}

.log-entry-has-url > .log-entry-header {
  cursor: pointer;
}

.log-url-indicator {
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(130, 170, 255, 0.6);
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(130, 170, 255, 0.08);
  white-space: nowrap;
  user-select: none;
}

.log-url-indicator.expanded {
  color: rgba(130, 170, 255, 0.85);
  background: rgba(130, 170, 255, 0.15);
}

.log-url-line {
  padding-left: 198px;
  padding-top: 2px;
  padding-bottom: 2px;
  user-select: text;
  cursor: text;
}

.log-url {
  color: rgba(130, 170, 255, 0.7);
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
}

.log-message-trace,
.log-message-debug {
  color: rgba(255, 255, 255, 0.6);
}

.log-message-info {
  color: #70c0e8;
}

.log-message-warn {
  color: #f2c97d;
}

.log-message-error,
.log-message-fatal {
  color: #e88080;
}

/* ============================================
   LOG GROUPS (PARSE GROUPING)
   ============================================ */
.log-group {
  border-radius: 3px;
  border-left: 2px solid rgba(112, 192, 232, 0.4);
  margin: 2px 0;
}

.log-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.15s;
  user-select: text;
}

.log-group-header:hover {
  background: #1a1a1e;
}

.log-group-toggle {
  flex-shrink: 0;
  width: 14px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  cursor: pointer;
  user-select: none;
}

.log-group-summary {
  flex: 1;
  color: #70c0e8;
  font-size: 14px;
  font-weight: 500;
}

.log-group-count {
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
  font-size: 12px;
  margin-left: 4px;
}

.log-group-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 600;
  margin-left: 8px;
  vertical-align: middle;
}

.log-group-badge-error {
  color: #e88080;
  background: rgba(232, 128, 128, 0.15);
  border: 1px solid rgba(232, 128, 128, 0.3);
}

.log-group-badge-warn {
  color: #f2c97d;
  background: rgba(242, 201, 125, 0.15);
  border: 1px solid rgba(242, 201, 125, 0.3);
}

.log-group-url {
  margin-left: 8px;
  color: rgba(127, 231, 196, 0.7);
  font-size: 11px;
  user-select: text;
  cursor: text;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-group-url:hover {
  color: rgba(127, 231, 196, 1);
}

.log-group-body {
  padding-left: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.log-entry-grouped {
  opacity: 0.9;
}

/* ============================================
   PAGINATION INDICATOR
   ============================================ */
.pagination-indicator {
  padding: 12px;
  margin-top: 8px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-style: italic;
}

.pagination-indicator.max-reached {
  color: rgba(242, 201, 125, 0.8);
  font-weight: 500;
}

/* ============================================
   SCROLLBAR STYLING
   ============================================ */
.logs-list-container::-webkit-scrollbar {
  width: 8px;
}

.logs-list-container::-webkit-scrollbar-track {
  background: #18181c;
  border-radius: 4px;
}

.logs-list-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.logs-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
