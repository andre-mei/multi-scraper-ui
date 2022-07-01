<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useScrapersStore } from "@/stores/scrapers";
import { useWorkersStore } from "@/stores/workers";
import { useStatusColors } from "@/composables/useStatusColors";
import { useFormatters } from "@/composables/useFormatters";
import { phaseText, DATA_TABLES } from "@/composables/usePhases";
import WorkerTable from "@/components/workers/WorkerTable.vue";
import MetricsCard from "@/components/metrics/MetricsCard.vue";
import ProgressCard from "@/components/metrics/ProgressCard.vue";
import LogViewer from "@/components/logs/LogViewer.vue";
import CommandButtons from "@/components/commands/CommandButtons.vue";
import ConfigEditor from "@/components/config/ConfigEditor.vue";
import ProxyTable from "@/components/proxies/ProxyTable.vue";
import DataTab from "@/components/scrapers/DataTab.vue";

const route = useRoute();
const router = useRouter();
const scrapersStore = useScrapersStore();
const workersStore = useWorkersStore();
const { getStatusType } = useStatusColors();
const { formatTimestamp, formatRelativeTime } = useFormatters();

const scraperId = computed(() => route.params.scraperId as string);
// Use computed to get scraper from store - this ensures reactivity to WebSocket updates
const scraper = computed(
  () => scrapersStore.scrapers.get(scraperId.value) ?? null,
);
const tables = DATA_TABLES;

const selectedWorkerIds = ref<string[]>([]);
const workersLoading = ref(false);
const expandedEvents = ref<Set<number>>(new Set());

// Status history line: the scraper's message, e.g. "(PHASE_2_CRAWL) | Phase 2 started: Crawl/Paginate"
function eventText(event: { message: string }) {
  return event.message;
}

function toggleEventExpand(idx: number) {
  const s = new Set(expandedEvents.value);
  if (s.has(idx)) s.delete(idx);
  else s.add(idx);
  expandedEvents.value = s;
}

const tabs: { key: string; label: string; disabled?: boolean }[] = [
  { key: "details", label: "Details" },
  { key: "progress", label: "Progress" },
  { key: "workers", label: "Workers" },
  { key: "logs", label: "Logs" },
  { key: "config", label: "Configuration" },
  { key: "proxies", label: "Proxies" },
  { key: "data", label: "Data" },
];

// Sync activeTab with route param
const validTabKeys = computed(() => tabs.map((t) => t.key));
const activeTab = computed({
  get() {
    const tab = route.params.tab as string | undefined;
    return tab && validTabKeys.value.includes(tab) ? tab : "details";
  },
  set(val: string) {
    router.replace({
      name: "scraper-detail",
      params: {
        scraperId: scraperId.value,
        tab: val,
        subTab: "",
      },
    });
  },
});

const currentSubTab = computed(
  () => (route.params.subTab as string) || undefined,
);

function onSubTabChange(slug: string) {
  router.replace({
    name: "scraper-detail",
    params: {
      scraperId: scraperId.value,
      tab: activeTab.value,
      subTab: slug,
    },
  });
}

// A scraper is considered disconnected only when status is explicitly DISCONNECTED
const isDisconnected = computed(() => scraper.value?.status === "DISCONNECTED");

// Calculate proxy success rate as percentage (-1 means never used)
const proxySuccessRate = computed(() => {
  const stats = scraper.value?.proxyStats;
  if (!stats || !stats.proxyTotalRequests) return -1;
  return (stats.proxySuccessfulRequests / stats.proxyTotalRequests) * 100;
});

async function loadData() {
  if (!scraperId.value) return;

  // Fetch both scraper and workers data in parallel
  // The store will be updated, and our computed `scraper` will react to it
  await Promise.all([
    scrapersStore.fetchScraper(scraperId.value),
    workersStore.fetchWorkers(scraperId.value),
  ]);
}

function handleWorkerSelect(workerIds: string[]) {
  selectedWorkerIds.value = workerIds;
}

async function refreshWorkers() {
  if (!scraperId.value) return;
  workersLoading.value = true;
  try {
    await workersStore.fetchWorkers(scraperId.value);
  } finally {
    workersLoading.value = false;
  }
}

// watch with immediate:true handles initial load - no need for onMounted
watch(scraperId, loadData, { immediate: true });
</script>

<template>
  <div class="scraper-detail-page">
    <!-- Breadcrumb Navigation -->
    <nav class="page-breadcrumb">
      <button @click="router.push('/scrapers')" class="breadcrumb-link">
        Scrapers
      </button>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{{ scraper?.name || scraperId }}</span>
    </nav>

    <!-- Page Header Section -->
    <header class="page-header">
      <div class="header-info">
        <h1 class="page-title">{{ scraper?.name || scraperId }}</h1>
        <span
          v-if="scraper"
          :class="['status-badge', `status-${getStatusType(scraper.status)}`]"
        >
          {{ scraper.status }}
        </span>
        <span v-if="scraper?.currentPhase" class="phase-badge">
          {{ phaseText(scraper.currentPhase) }}
        </span>
      </div>
      <div class="header-actions">
        <CommandButtons
          v-if="scraper"
          :scraper-id="scraper.scraperId"
          :worker-ids="
            selectedWorkerIds.length > 0 ? selectedWorkerIds : undefined
          "
          :disabled="isDisconnected"
          :scraper-status="scraper.status"
          :scraper="scraper"
        />
      </div>
    </header>

    <!-- Disconnection Alert -->
    <div v-if="isDisconnected" class="alert alert-warning">
      <div class="alert-icon">⚠</div>
      <div class="alert-content">
        <div class="alert-title">Scraper Disconnected</div>
        <div class="alert-message">
          This scraper is currently disconnected. Commands cannot be sent until
          it reconnects.
        </div>
      </div>
    </div>

    <!-- Main Tabs -->
    <div class="tabs-container">
      <div class="tabs-header">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-button', { active: activeTab === tab.key, disabled: tab.disabled }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tabs-content">
        <!-- Details Tab -->
        <div v-show="activeTab === 'details'" class="tab-panel">
          <!-- Scraper Information Card -->
          <section class="card">
            <h3 class="card-title">Scraper Information</h3>
            <dl class="info-grid">
              <div class="info-item">
                <dt>ID</dt>
                <dd class="code">{{ scraper?.scraperId }}</dd>
              </div>
              <div class="info-item">
                <dt>Type</dt>
                <dd>{{ scraper?.type }}</dd>
              </div>
              <div class="info-item">
                <dt>Version</dt>
                <dd>{{ scraper?.version }}</dd>
              </div>
              <div class="info-item">
                <dt>Scraping Mode</dt>
                <dd>{{ scraper?.scrapingMode || "HTTP" }}</dd>
              </div>
              <div class="info-item">
                <dt>Host</dt>
                <dd>{{ scraper?.host }}:{{ scraper?.port }}</dd>
              </div>
              <div class="info-item">
                <dt>Registered</dt>
                <dd>{{ formatTimestamp(scraper?.registeredAt) }}</dd>
              </div>
              <div class="info-item">
                <dt>Last Heartbeat</dt>
                <dd>{{ formatRelativeTime(scraper?.lastHeartbeat) }}</dd>
              </div>
              <div class="info-item">
                <dt>Last Health</dt>
                <dd>{{ formatRelativeTime(scraper?.lastHealthReport) }}</dd>
              </div>
              <div class="info-item">
                <dt>Workers</dt>
                <dd>
                  {{ scraper?.activeWorkerCount }} / {{ scraper?.workerCount }}
                </dd>
              </div>
            </dl>
          </section>

          <!-- Metrics Section -->
          <MetricsCard v-if="scraper" :scraper="scraper" />
        </div>

        <!-- Progress Tab -->
        <div v-show="activeTab === 'progress'" class="tab-panel">
          <ProgressCard v-if="scraper" :scraper="scraper" />

          <!-- Status History section -->
          <section class="card" style="margin-top: 16px">
            <h3 class="card-title">Status History</h3>
            <div class="status-history-list">
              <template v-if="scraper?.events && scraper.events.length > 0">
                <div
                  v-for="(event, idx) in scraper.events
                    .filter((e) => e.type !== 'WAITING_APPROVAL')
                    .slice(0, 100)"
                  :key="idx"
                  :class="[
                    'status-history-item',
                    {
                      'status-error-row':
                        event.severity?.toLowerCase() === 'error',
                    },
                    { 'status-expanded': expandedEvents.has(idx) },
                  ]"
                  @click="toggleEventExpand(idx)"
                >
                  <div class="status-history-row">
                    <span
                      :class="[
                        'severity-dot',
                        `severity-${event.severity?.toLowerCase() || 'info'}`,
                      ]"
                    />
                    <span class="event-time" :title="event.timestamp">{{
                      formatRelativeTime(event.timestamp)
                    }}</span>
                    <span class="event-datetime">{{
                      formatTimestamp(event.timestamp)
                    }}</span>
                    <span
                      :class="[
                        'event-type-badge',
                        `event-${event.severity?.toLowerCase() || 'info'}`,
                      ]"
                    >
                      {{ event.type }}
                    </span>
                    <span class="event-message">{{ eventText(event) }}</span>
                    <span class="event-expand-icon">{{
                      expandedEvents.has(idx) ? "▾" : "▸"
                    }}</span>
                  </div>
                  <div
                    v-if="expandedEvents.has(idx)"
                    class="status-history-detail"
                  >
                    <div class="detail-message">{{ eventText(event) }}</div>
                    <div
                      v-if="
                        event.metadata && Object.keys(event.metadata).length > 0
                      "
                      class="detail-metadata"
                    >
                      <div
                        v-for="(value, key) in event.metadata"
                        :key="key"
                        class="detail-meta-item"
                      >
                        <span class="detail-meta-key">{{ key }}:</span>
                        <span class="detail-meta-value">{{ value }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="status-history-empty">
                No status events yet. Start the scraper to see status updates.
              </div>
            </div>
          </section>
        </div>

        <!-- Workers Tab -->
        <div v-show="activeTab === 'workers'" class="tab-panel">
          <section class="card">
            <div class="card-header-with-actions">
              <h3 class="card-title">
                Workers ({{ scraper?.workerCount || 0 }})
              </h3>
              <div class="card-actions">
                <button
                  @click="refreshWorkers"
                  :disabled="workersLoading"
                  class="btn btn-secondary"
                >
                  {{ workersLoading ? "Loading..." : "Refresh Workers" }}
                </button>
                <span v-if="selectedWorkerIds.length > 0" class="selected-count"
                  >{{ selectedWorkerIds.length }} selected</span
                >
              </div>
            </div>
            <WorkerTable
              v-if="scraperId"
              :scraper-id="scraperId"
              :selectable="true"
              v-model:checked-row-keys="selectedWorkerIds"
              @select="handleWorkerSelect"
            />
          </section>
        </div>

        <!-- Logs Tab -->
        <div v-show="activeTab === 'logs'" class="tab-panel tab-panel-logs">
          <section class="card card-logs">
            <LogViewer
              v-if="scraperId && activeTab === 'logs'"
              :scraper-id="scraperId"
              :fill-height="true"
            />
          </section>
        </div>

        <!-- Configuration Tab -->
        <div v-show="activeTab === 'config'" class="tab-panel">
          <ConfigEditor v-if="scraper" :scraper="scraper" @updated="loadData" />
        </div>

        <!-- Proxies Tab -->
        <div v-show="activeTab === 'proxies'" class="tab-panel">
          <section class="card">
            <div class="proxy-header">
              <div class="proxy-header-left">
                <span class="proxy-stat-total"
                  >{{ scraper?.proxyStats?.totalProxies || 0 }} total</span
                >
                <span class="proxy-stat-separator">|</span>
                <span class="proxy-stat-available"
                  >{{
                    scraper?.proxyStats?.availableProxies || 0
                  }}
                  available</span
                >
                <span class="proxy-stat-separator">|</span>
                <span class="proxy-stat-inuse"
                  >{{ scraper?.proxyStats?.inUseProxies || 0 }} In Use</span
                >
              </div>
              <div class="proxy-header-right">
                <span class="proxy-requests-label">Requests:</span>
                <span class="proxy-requests-success"
                  >{{
                    (
                      scraper?.proxyStats?.proxySuccessfulRequests || 0
                    ).toLocaleString()
                  }}
                  success</span
                >
                <span class="proxy-requests-separator">/</span>
                <span class="proxy-requests-failed"
                  >{{
                    (
                      scraper?.proxyStats?.proxyFailedRequests || 0
                    ).toLocaleString()
                  }}
                  failed</span
                >
                <span class="proxy-requests-separator">/</span>
                <span class="proxy-requests-rate">{{
                  proxySuccessRate >= 0
                    ? proxySuccessRate.toFixed(0) + "% rate"
                    : "- rate"
                }}</span>
              </div>
            </div>
            <ProxyTable
              v-if="
                scraper &&
                scraper.proxyDetails &&
                scraper.proxyDetails.length > 0
              "
              :scraper-id="scraperId"
              :proxies="scraper.proxyDetails"
              @proxy-toggled="loadData"
              @refresh-requested="loadData"
            />
            <div v-else class="empty-state">
              No proxy information available. Proxies will appear here when the
              scraper sends health data.
            </div>
          </section>
        </div>

        <!-- Data Tab -->
        <div v-show="activeTab === 'data'" class="tab-panel">
          <DataTab
            v-if="scraperId"
            :scraper-id="scraperId"
            :active="activeTab === 'data'"
            :sub-tab="currentSubTab"
            :tables="tables"
            @update:sub-tab="onSubTabChange"
          />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   SCRAPER DETAIL PAGE
   ============================================ */
.scraper-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  gap: 10px;
}

/* ============================================
   BREADCRUMB NAVIGATION
   ============================================ */
.page-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.breadcrumb-link {
  background: none;
  border: none;
  color: #63e2b7;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s;
}

.breadcrumb-link:hover {
  color: #7fe7c4;
  text-decoration: underline;
}

.breadcrumb-separator {
  color: rgba(255, 255, 255, 0.3);
}

.breadcrumb-current {
  color: rgba(255, 255, 255, 0.82);
  font-weight: 500;
}

/* ============================================
   PAGE HEADER
   ============================================ */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 0;
  gap: 16px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 500;
  color: #ffffffe6;
}

/* Status & Phase Badges */
.status-badge,
.phase-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid;
}

.status-badge.status-success {
  background: rgba(99, 226, 183, 0.1);
  color: #63e2b7;
  border-color: rgba(99, 226, 183, 0.3);
}

.status-badge.status-error {
  background: rgba(232, 128, 128, 0.1);
  color: #e88080;
  border-color: rgba(232, 128, 128, 0.3);
}

.status-badge.status-warning {
  background: rgba(242, 201, 125, 0.1);
  color: #f2c97d;
  border-color: rgba(242, 201, 125, 0.3);
}

.status-badge.status-default,
.status-badge.status-info {
  background: rgba(112, 192, 232, 0.1);
  color: #70c0e8;
  border-color: rgba(112, 192, 232, 0.3);
}

.phase-badge {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.15);
  font-size: 12px;
  border-radius: 12px;
}

.header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ============================================
   ALERT
   ============================================ */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 4px;
  background: rgba(242, 201, 125, 0.1);
  border: 1px solid rgba(242, 201, 125, 0.3);
  color: #f2c97d;
}

.alert-warning {
  background: rgba(242, 201, 125, 0.1);
  border-color: rgba(242, 201, 125, 0.3);
  color: #f5d599;
}

.alert-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.alert-message {
  font-size: 13px;
  opacity: 0.9;
}

/* ============================================
   TABS CONTAINER
   ============================================ */
.tabs-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #18181c;
  border-radius: 4px;
  min-height: 0;
}

.tabs-header {
  display: flex;
  align-items: center;
  gap: 4px;
  /*padding: 8px 12px 0;*/
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  flex-shrink: 0;
}

.tab-button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  margin-bottom: -1px;
}

.tab-button:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
}

.tab-button.active {
  color: #63e2b7;
  border-bottom-color: #63e2b7;
}

.tab-button.disabled {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.tabs-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.tab-panel {
  height: 100%;
  overflow-y: auto;
  /*padding: 16px;*/
}

.tab-panel-logs {
  /*padding: 12px;*/
  overflow: hidden;
}

/* Scrollbar for tab panels */
.tab-panel::-webkit-scrollbar {
  width: 8px;
}

.tab-panel::-webkit-scrollbar-track {
  background: #18181c;
}

.tab-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.tab-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ============================================
   CARD
   ============================================ */
.card {
  background: #18181c;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  padding-left: 12px;
  margin-bottom: 8px;
}

.card-logs {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-bottom: 0;
  padding: 0;
}

.card-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.card-header-with-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}

.card-header-with-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

/* ============================================
   INFO GRID (Description List)
   ============================================ */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 0;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item dt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-item dd {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.82);
}

.info-item dd.code {
  font-family: "Consolas", "Monaco", monospace;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
}

/* ============================================
   STATS GRID
   ============================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #63e2b7;
}

/* ============================================
   PROXY HEADER (inline stats)
   ============================================ */
.proxy-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 12px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.proxy-header-left,
.proxy-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.proxy-stat-total {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

.proxy-stat-available {
  color: #63e2b7;
  font-weight: 500;
}

.proxy-stat-inuse {
  color: #f2c97d;
  font-weight: 500;
}

.proxy-stat-separator {
  color: rgba(255, 255, 255, 0.25);
}

.proxy-requests-label {
  color: rgba(255, 255, 255, 0.5);
}

.proxy-requests-success {
  color: #63e2b7;
}

.proxy-requests-failed {
  color: #e88080;
}

.proxy-requests-separator {
  color: rgba(255, 255, 255, 0.25);
}

.proxy-requests-rate {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

/* ============================================
   BUTTONS
   ============================================ */
.btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid transparent;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(112, 192, 232, 0.15);
  border-color: #70c0e8;
  color: #70c0e8;
}

.btn-warning:hover:not(:disabled) {
  background: rgba(242, 201, 125, 0.15);
  border-color: #f2c97d;
  color: #f5d599;
}

.btn-success:hover:not(:disabled) {
  background: rgba(99, 226, 183, 0.15);
  border-color: #63e2b7;
  color: #7fe7c4;
}

/* ============================================
   MISC
   ============================================ */
.selected-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  padding: 0 8px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* ============================================
   STATUS HISTORY section
   ============================================ */
.status-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.status-history-empty {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 13px;
}

.status-history-item {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.status-history-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-history-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.status-error-row {
  background: rgba(232, 128, 128, 0.08);
  border-left: 3px solid #e88080;
}

.status-error-row:hover {
  background: rgba(232, 128, 128, 0.14);
}

.status-history-detail {
  margin-top: 8px;
  padding: 8px 12px 6px 26px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.detail-message {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 6px;
}

.detail-metadata {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.detail-meta-item {
  font-size: 11px;
}

.detail-meta-key {
  color: rgba(255, 255, 255, 0.45);
  margin-right: 6px;
  font-family: monospace;
}

.detail-meta-value {
  color: rgba(255, 255, 255, 0.7);
  font-family: monospace;
}

.event-expand-icon {
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  flex-shrink: 0;
  margin-left: auto;
}

.severity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.severity-info {
  background: #70c0e8;
}
.severity-warning {
  background: #f2c97d;
}
.severity-error {
  background: #e88080;
}
.severity-success {
  background: #63e2b7;
}

.event-time {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  min-width: 55px;
  flex-shrink: 0;
}

.event-datetime {
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  min-width: 140px;
  flex-shrink: 0;
  font-family: monospace;
}

.event-type-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.event-info {
  background: rgba(112, 192, 232, 0.15);
  color: #70c0e8;
}

.event-warning {
  background: rgba(242, 201, 125, 0.15);
  color: #f2c97d;
}

.event-error {
  background: rgba(232, 128, 128, 0.15);
  color: #e88080;
}

.event-success {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}

.event-message {
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
