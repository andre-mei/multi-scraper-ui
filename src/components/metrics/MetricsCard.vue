<script setup lang="ts">
import {
  NCard,
  NSpace,
  NText,
  NGrid,
  NGi,
  NStatistic,
} from "naive-ui";
import type { Scraper, Worker } from "@/types";
import { useFormatters } from "@/composables/useFormatters";

defineProps<{
  scraper?: Scraper;
  worker?: Worker;
}>();

const { formatNumber, formatBytes, formatPercent, formatRate, formatDuration } =
  useFormatters();

// No "Reset" button on purpose (plan decision D4): RESET_METRICS reaches no scraper, and lifetime
// metrics are re-sent with every HEALTH report, so a reset would be overwritten within seconds.
</script>

<template>
  <!-- Scraper Lifetime Metrics -->
  <NCard
    v-if="scraper"
    id="scraper-metrics-card"
    class="scraper-metrics-card"
    size="small"
  >
    <template #header>
      <NText>Scraper Lifetime Metrics</NText>
    </template>

    <NSpace vertical :size="16">
      <NGrid
        :cols="4"
        :x-gap="12"
        :y-gap="12"
        id="scraper-metrics-grid"
        class="scraper-metrics-grid"
      >
        <NGi>
          <NStatistic
            label="Total Items Processed"
            :value="formatNumber(scraper.metrics?.processedItems || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Total Successful Items"
            :value="formatNumber(scraper.metrics?.successfulItems || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Processing Rate"
            :value="formatRate(scraper.metrics?.itemsPerSecond || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Total Downloaded"
            :value="formatBytes(scraper.metrics?.totalBytesDownloaded || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Requests"
            :value="formatNumber(scraper.metrics?.totalRequests || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Failed Requests"
            :value="formatNumber(scraper.metrics?.failedRequests || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Uptime"
            :value="formatDuration(scraper.metrics?.uptimeSeconds || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic label="Active Workers" :value="scraper.activeWorkerCount">
            <template #suffix> / {{ scraper.workerCount }} </template>
          </NStatistic>
        </NGi>
      </NGrid>
    </NSpace>
  </NCard>

  <!-- Worker Metrics -->
  <NCard
    v-if="worker"
    id="worker-metrics-card"
    class="worker-metrics-card"
    title="Worker Metrics"
    size="small"
  >
    <NSpace vertical :size="16">
      <div id="worker-progress-section" class="worker-progress-section">
        <NText depth="3" class="text-sm">Progress</NText>
        <NProgress
          type="line"
          :percentage="
            worker.metrics?.totalItems
              ? Math.round(
                  (worker.metrics.processedItems / worker.metrics.totalItems) *
                    100,
                )
              : worker.metrics?.progressPercent || 0
          "
          :height="20"
          :border-radius="4"
          :fill-border-radius="4"
          indicator-placement="inside"
          :processing="worker.status === 'RUNNING'"
        />
      </div>

      <NGrid
        :cols="4"
        :x-gap="12"
        :y-gap="12"
        id="worker-metrics-grid"
        class="worker-metrics-grid"
      >
        <NGi>
          <NStatistic
            label="Items Processed"
            :value="formatNumber(worker.metrics?.processedItems || 0)"
          >
            <template #suffix>
              / {{ formatNumber(worker.metrics?.totalItems || 0) }}
            </template>
          </NStatistic>
        </NGi>
        <NGi>
          <NStatistic
            label="Success Rate"
            :value="formatPercent(worker.metrics?.successRate || 100)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Processing Rate"
            :value="formatRate(worker.metrics?.itemsPerSecond || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Avg Time (ms)"
            :value="(worker.metrics?.averageProcessingTimeMs || 0).toFixed(0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Downloaded"
            :value="formatBytes(worker.metrics?.bytesDownloaded || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Requests"
            :value="formatNumber(worker.metrics?.requestsMade || 0)"
          />
        </NGi>
        <NGi>
          <NStatistic
            label="Retries"
            :value="worker.metrics?.retryCount || 0"
          />
        </NGi>
        <NGi>
          <NStatistic label="Detections" :value="worker.detectionCount || 0" />
        </NGi>
      </NGrid>
    </NSpace>
  </NCard>
</template>
