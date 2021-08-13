<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NCard,
  NH2,
  NSpace,
  NTag,
  NText,
  NTabs,
  NTabPane,
  NDescriptions,
  NDescriptionsItem,
  NBreadcrumb,
  NBreadcrumbItem,
  NDivider,
  NAlert,
} from "naive-ui";
import { useScrapersStore } from "@/stores/scrapers";
import { useWorkersStore } from "@/stores/workers";
import { useStatusColors } from "@/composables/useStatusColors";
import { useFormatters } from "@/composables/useFormatters";
import { phaseText } from "@/composables/usePhases";
import MetricsCard from "@/components/metrics/MetricsCard.vue";
import LogViewer from "@/components/logs/LogViewer.vue";

const route = useRoute();
const router = useRouter();
const scrapersStore = useScrapersStore();
const workersStore = useWorkersStore();
const { getStatusType } = useStatusColors();
const { formatTimestamp, formatRelativeTime } = useFormatters();

const scraperId = computed(() => route.params.scraperId as string);
const workerId = computed(() => route.params.workerId as string);
const activeTab = ref("metrics");

const scraper = computed(() => scrapersStore.scrapers.get(scraperId.value));

// Reactively track the worker from the store (updated via WebSocket HEALTH_UPDATE)
const worker = computed(
  () => workersStore.getWorker(scraperId.value, workerId.value) ?? null,
);

// Visual status: show PAUSED when scraper itself is paused
const displayStatus = computed(() => {
  if (
    scraper.value?.status === "PAUSED" &&
    worker.value &&
    worker.value.status !== "PAUSED"
  ) {
    return "PAUSED";
  }
  return worker.value?.status;
});

// Only show disconnected alert when scraper status is actually DISCONNECTED
const isDisconnected = computed(() => scraper.value?.status === "DISCONNECTED");

async function loadData() {
  if (!scraperId.value || !workerId.value) return;

  await scrapersStore.fetchScraper(scraperId.value);
  await workersStore.fetchWorker(scraperId.value, workerId.value);
}

// watch with immediate:true handles initial load - no need for onMounted
watch([scraperId, workerId], loadData, { immediate: true });
</script>

<template>
  <div class="space-y-6">
    <!-- Breadcrumb -->
    <NBreadcrumb>
      <NBreadcrumbItem @click="router.push('/scrapers')"
        >Scrapers</NBreadcrumbItem
      >
      <NBreadcrumbItem @click="router.push(`/scrapers/${scraperId}`)">
        {{ scraper?.name || scraperId }}
      </NBreadcrumbItem>
      <NBreadcrumbItem>{{ worker?.name || workerId }}</NBreadcrumbItem>
    </NBreadcrumb>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <NSpace align="center">
        <NH2 class="m-0">{{ worker?.name || workerId }}</NH2>
        <NTag
          v-if="worker"
          :type="getStatusType(displayStatus || worker.status)"
          size="large"
        >
          {{ displayStatus || worker.status }}
        </NTag>
        <NTag v-if="worker?.currentPhase" size="small" round>
          {{ phaseText(worker.currentPhase) }}
        </NTag>
      </NSpace>
    </div>

    <!-- Disconnection Alert -->
    <NAlert v-if="isDisconnected" type="warning" title="Scraper Disconnected">
      The parent scraper is currently disconnected.
    </NAlert>

    <!-- Info Card -->
    <NCard size="small">
      <NDescriptions :column="3" label-placement="left" size="small">
        <NDescriptionsItem label="Worker ID">
          <NText code>{{ worker?.workerId }}</NText>
        </NDescriptionsItem>
        <NDescriptionsItem label="Scraper">
          <NText code>{{ worker?.scraperId }}</NText>
        </NDescriptionsItem>
        <NDescriptionsItem label="Status">
          <NTag
            v-if="worker"
            :type="getStatusType(displayStatus || worker.status)"
            size="small"
          >
            {{ displayStatus || worker.status }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="Proxy">
          <NText v-if="worker?.proxyIp" code>
            <!--    {{ worker.proxyProtocol }}://       -->
            {{ worker.proxyIp }}
            <!--   :{{worker.proxyPort}}                -->
          </NText>
          <NText v-else depth="3">No proxy</NText>
        </NDescriptionsItem>
        <NDescriptionsItem label="Current Task">
          {{ worker?.currentTask || "-" }}
        </NDescriptionsItem>
        <NDescriptionsItem label="Started">
          {{ formatTimestamp(worker?.startedAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem label="Last Active">
          {{ formatRelativeTime(worker?.lastActivityAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem label="Detections">
          <NText :type="(worker?.detectionCount || 0) > 0 ? 'warning' : 'default'">
            {{ worker?.detectionCount || 0 }}
          </NText>
        </NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <!-- Last Error -->
    <NAlert
      v-if="worker?.lastError"
      type="error"
      :title="`Last Error (${formatRelativeTime(worker.lastErrorAt)})`"
    >
      {{ worker.lastError }}
    </NAlert>

    <NDivider />

    <!-- Tabs -->
    <NTabs v-model:value="activeTab" type="line">
      <NTabPane name="metrics" tab="Metrics">
        <MetricsCard v-if="worker" :worker="worker" />
        <!-- Current URL below progress/metrics -->
        <NCard v-if="worker?.currentUrl" size="small" class="mt-3">
          <NText depth="3" class="text-xs">Current URL</NText>
          <div class="mt-1">
            <NText class="text-xs break-all" :title="worker.currentUrl">
              {{ worker.currentUrl }}
            </NText>
          </div>
        </NCard>
      </NTabPane>

      <NTabPane name="logs" tab="Logs">
        <NCard>
          <LogViewer
            v-if="scraperId && workerId"
            :scraper-id="scraperId"
            :worker-id="workerId"
            :max-height="500"
          />
        </NCard>
      </NTabPane>
    </NTabs>
  </div>
</template>
