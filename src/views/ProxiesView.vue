<script setup lang="ts">
import { computed, ref } from "vue";
import { useScrapersStore } from "@/stores/scrapers";
import { useFormatters } from "@/composables/useFormatters";
import type { ProxyDetail } from "@/types";

const scrapersStore = useScrapersStore();
const { formatBytes } = useFormatters();

// Aggregate all proxy details from all connected scrapers
interface GlobalProxy extends ProxyDetail {
  scraperName: string;
  scraperId: string;
}

const allProxies = computed<GlobalProxy[]>(() => {
  const proxies: GlobalProxy[] = [];
  for (const scraper of scrapersStore.scraperList) {
    if (scraper.proxyDetails && scraper.proxyDetails.length > 0) {
      for (const proxy of scraper.proxyDetails) {
        proxies.push({
          ...proxy,
          scraperName: scraper.name || scraper.scraperId,
          scraperId: scraper.scraperId,
        });
      }
    }
  }
  return proxies;
});

// Sorting
const sortKey = ref<string>("provider");
const sortOrder = ref<"asc" | "desc">("asc");

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortOrder.value = "asc";
  }
}

function sortIcon(key: string): string {
  if (sortKey.value !== key) return "↕";
  return sortOrder.value === "asc" ? "↑" : "↓";
}

const sortedProxies = computed(() => {
  const list = [...allProxies.value];
  const key = sortKey.value as keyof GlobalProxy;
  const dir = sortOrder.value === "asc" ? 1 : -1;

  list.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number")
      return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  return list;
});

// Summary stats
const totalProxies = computed(() => allProxies.value.length);
const inUseProxies = computed(
  () => allProxies.value.filter((p) => p.inUse).length,
);
const availableProxies = computed(
  () => allProxies.value.filter((p) => p.enabled && !p.inUse).length,
);
const totalRequests = computed(() =>
  allProxies.value.reduce((sum, p) => sum + (p.totalRequests || 0), 0),
);
const totalSuccess = computed(() =>
  allProxies.value.reduce((sum, p) => sum + (p.successfulRequests || 0), 0),
);
const totalFailed = computed(() =>
  allProxies.value.reduce((sum, p) => sum + (p.failedRequests || 0), 0),
);
const overallSuccessRate = computed(() => {
  if (totalRequests.value === 0) return 0;
  return (totalSuccess.value / totalRequests.value) * 100;
});
</script>

<template>
  <div class="proxies-view">
    <div class="page-header">
      <h2 class="page-title">Global Proxies</h2>
      <div class="header-stats">
        <span class="stat-total">{{ totalProxies }} total</span>
        <span class="stat-sep">|</span>
        <span class="stat-available">{{ availableProxies }} available</span>
        <span class="stat-sep">|</span>
        <span class="stat-inuse">{{ inUseProxies }} in use</span>
        <span class="stat-sep">—</span>
        <span class="stat-label">Requests:</span>
        <span class="stat-success"
          >{{ totalSuccess.toLocaleString() }} success</span
        >
        <span class="stat-sep">/</span>
        <span class="stat-failed"
          >{{ totalFailed.toLocaleString() }} failed</span
        >
        <span class="stat-sep">/</span>
        <span class="stat-rate">{{ overallSuccessRate.toFixed(0) }}% rate</span>
      </div>
    </div>

    <div class="table-container" v-if="sortedProxies.length > 0">
      <table class="proxies-table">
        <thead>
          <tr>
            <th @click="toggleSort('provider')" class="sortable">
              Provider {{ sortIcon("provider") }}
            </th>
            <th @click="toggleSort('tier')" class="sortable">
              Tier {{ sortIcon("tier") }}
            </th>
            <th @click="toggleSort('proxyIp')" class="sortable">
              Proxy IP {{ sortIcon("proxyIp") }}
            </th>
            <th @click="toggleSort('country')" class="sortable">
              Country {{ sortIcon("country") }}
            </th>
            <th @click="toggleSort('totalRequests')" class="sortable num">
              Requests {{ sortIcon("totalRequests") }}
            </th>
            <th @click="toggleSort('avgResponseTimeMs')" class="sortable num">
              Avg Time {{ sortIcon("avgResponseTimeMs") }}
            </th>
            <th @click="toggleSort('bytesDownloaded')" class="sortable num">
              Downloaded {{ sortIcon("bytesDownloaded") }}
            </th>
            <th @click="toggleSort('successRate')" class="sortable num">
              Success Rate {{ sortIcon("successRate") }}
            </th>
            <th @click="toggleSort('selectionScore')" class="sortable num">
              Score {{ sortIcon("selectionScore") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="proxy in sortedProxies"
            :key="proxy.proxyId + '-' + proxy.scraperId"
            :class="{
              'row-disabled': !proxy.enabled,
              'row-inuse': proxy.inUse,
              'row-rate-good': proxy.successRate * 100 >= 95,
              'row-rate-ok':
                proxy.successRate * 100 >= 80 && proxy.successRate * 100 < 95,
              'row-rate-bad':
                proxy.successRate > 0 && proxy.successRate * 100 < 80,
            }"
          >
            <td>{{ proxy.provider }}</td>
            <td>
              <span class="tier-badge">{{ proxy.tier }}</span>
            </td>
            <td class="login-cell">{{ proxy.proxyIp || "—" }}</td>
            <td>{{ proxy.country || "—" }}</td>
            <td class="num">
              {{ (proxy.totalRequests || 0).toLocaleString() }}
            </td>
            <td class="num">
              {{
                proxy.avgResponseTimeMs
                  ? proxy.avgResponseTimeMs.toFixed(0) + "ms"
                  : "—"
              }}
            </td>
            <td class="num">{{ formatBytes(proxy.bytesDownloaded || 0) }}</td>
            <td class="num">
              <span
                :class="[
                  'rate-badge',
                  proxy.successRate * 100 >= 95
                    ? 'rate-good'
                    : proxy.successRate * 100 >= 80
                      ? 'rate-ok'
                      : 'rate-bad',
                ]"
              >
                {{
                  proxy.successRate
                    ? (proxy.successRate * 100).toFixed(1) + "%"
                    : "—"
                }}
              </span>
            </td>
            <td class="num">
              {{ proxy.selectionScore ? proxy.selectionScore.toFixed(1) : "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="empty-state">
      No proxy data available. Proxies will appear here when scrapers connect
      and send health data.
    </div>
  </div>
</template>

<style scoped>
.proxies-view {
  padding: 0 16px 16px 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.stat-total {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}
.stat-available {
  color: #63e2b7;
}
.stat-inuse {
  color: #f2c97d;
}
.stat-sep {
  color: rgba(255, 255, 255, 0.2);
}
.stat-label {
  color: rgba(255, 255, 255, 0.5);
}
.stat-success {
  color: #63e2b7;
}
.stat-failed {
  color: #e88080;
}
.stat-rate {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

.table-container {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 160px);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
}

.proxies-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.proxies-table th {
  padding: 10px 12px;
  text-align: left;
  background: rgba(30, 30, 30, 0.98);
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}

.proxies-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.proxies-table th.sortable:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.06);
}

.proxies-table th.num,
.proxies-table td.num {
  text-align: right;
}

.proxies-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.82);
}

.proxies-table tbody tr:hover {
  background: rgba(99, 130, 255, 0.06);
}

.proxies-table tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}

.row-disabled td {
  opacity: 0.4;
}

.row-inuse td:first-child {
  border-left: 3px solid #63e2b7;
}

.row-rate-good td:first-child {
  border-left: 3px solid #63e2b7;
}

.row-rate-ok td:first-child {
  border-left: 3px solid #f2c97d;
}

.row-rate-bad td:first-child {
  border-left: 3px solid #e88080;
}

.tier-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
}

.login-cell {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.scraper-cell {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.rate-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  font-size: 12px;
}

.rate-good {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}

.rate-ok {
  background: rgba(242, 201, 125, 0.15);
  color: #f2c97d;
}

.rate-bad {
  background: rgba(232, 128, 128, 0.15);
  color: #e88080;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}
</style>
