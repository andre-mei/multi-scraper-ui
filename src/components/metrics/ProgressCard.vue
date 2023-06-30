<script setup lang="ts">
import { computed } from "vue";
import {
  NCard,
  NProgress,
  NSpace,
  NText,
  NGrid,
  NGi,
  NStatistic,
  NEmpty,
} from "naive-ui";
import type { Scraper } from "@/types";
import { useFormatters } from "@/composables/useFormatters";
import { useFlavor } from "@/composables/useFlavor";

const props = defineProps<{
  scraper: Scraper;
}>();

const { formatNumber, formatPercent, formatRate, formatDuration } =
  useFormatters();
const { stageText } = useFlavor(() => props.scraper);

// Show progress content only when scraper is not IDLE or DISCONNECTED
const hasActiveRun = computed(() => {
  const status = props.scraper?.status;
  return status && status !== "IDLE" && status !== "DISCONNECTED";
});

// Calculate ETA based on current progress
const estimatedTimeRemaining = computed(() => {
  const metrics = props.scraper?.metrics;
  if (!metrics || !metrics.itemsPerSecond || metrics.itemsPerSecond === 0)
    return null;

  const remaining = (metrics.totalItems || 0) - (metrics.processedItems || 0);
  if (remaining <= 0) return null;

  const secondsRemaining = remaining / metrics.itemsPerSecond;
  return formatDuration(secondsRemaining);
});
</script>

<template>
  <NCard
    id="progress-card"
    class="progress-card"
    title="Current Run Progress"
    size="small"
  >
    <!-- Show empty state when no active run -->
    <template v-if="!hasActiveRun">
      <NEmpty
        description="Start Scraper Run to see Progress metrics"
        :size="'large'"
      />
    </template>

    <!-- Show progress content when there's an active run -->
    <template v-else>
      <NSpace vertical :size="16">
        <!-- Overall Progress Bar -->
        <div id="run-progress-section" class="run-progress-section">
          <NSpace justify="space-between" align="center" class="mb-1">
            <NText depth="3" class="text-sm">Overall Progress</NText>
            <NText v-if="scraper.currentStage" depth="3" class="text-sm">
              Stage: {{ stageText(scraper.currentStage) }}
            </NText>
          </NSpace>
          <NProgress
            type="line"
            :percentage="scraper.metrics?.overallProgress || 0"
            :height="24"
            :border-radius="4"
            :fill-border-radius="4"
            indicator-placement="inside"
            :processing="scraper.status === 'RUNNING'"
          />
        </div>

        <!-- Run Metrics Grid -->
        <NGrid
          :cols="5"
          :x-gap="12"
          :y-gap="12"
          id="run-metrics-grid"
          class="run-metrics-grid"
        >
          <NGi>
            <NStatistic
              label="Items Processed"
              :value="formatNumber(scraper.metrics?.processedItems || 0)"
            >
              <template #suffix>
                / {{ formatNumber(scraper.metrics?.totalItems || 0) }}
              </template>
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic
              label="Success Rate"
              :value="
                formatPercent(
                  scraper.metrics?.totalItems
                    ? ((scraper.metrics?.successfulItems || 0) /
                        scraper.metrics.totalItems) *
                        100
                    : 100,
                )
              "
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
              label="Speed (per min)"
              :value="
                ((scraper.metrics?.itemsPerSecond || 0) * 60).toFixed(1) +
                '/min'
              "
            />
          </NGi>
          <NGi>
            <NStatistic label="ETA" :value="estimatedTimeRemaining || '--'" />
          </NGi>
          <NGi>
            <NStatistic
              label="Run Duration"
              :value="formatDuration(scraper.metrics?.uptimeSeconds || 0)"
            />
          </NGi>
          <NGi>
            <NStatistic
              label="Active Workers"
              :value="scraper.activeWorkerCount"
            >
              <template #suffix> / {{ scraper.workerCount }} </template>
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic
              label="Failed Items"
              :value="formatNumber(scraper.metrics?.failedItems || 0)"
            />
          </NGi>
          <NGi>
            <NStatistic
              label="Failed Requests"
              :value="formatNumber(scraper.metrics?.failedRequests || 0)"
            />
          </NGi>
        </NGrid>
      </NSpace>
    </template>
  </NCard>
</template>
