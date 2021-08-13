<script setup lang="ts">
import { computed } from "vue";
import {
  NCard,
  NStatistic,
  NGrid,
  NGi,
  NProgress,
  NSpace,
  NText,
  NSpin,
} from "naive-ui";
import { useScrapersStore } from "@/stores/scrapers";
import { useFormatters } from "@/composables/useFormatters";

const scrapersStore = useScrapersStore();
const { formatNumber, formatBytes, formatRate } = useFormatters();

const stats = computed(() => {
  const scrapers = scrapersStore.scraperList;

  const totalProcessed = scrapers.reduce(
    (sum, s) => sum + (s.metrics?.processedItems || 0),
    0,
  );
  const totalItems = scrapers.reduce(
    (sum, s) => sum + (s.metrics?.totalItems || 0),
    0,
  );
  const totalBytes = scrapers.reduce(
    (sum, s) => sum + (s.metrics?.totalBytesDownloaded || 0),
    0,
  );
  const avgRate =
    scrapers.length > 0
      ? scrapers.reduce((sum, s) => sum + (s.metrics?.itemsPerSecond || 0), 0) /
        scrapers.length
      : 0;

  return {
    scrapers: scrapersStore.scraperList.length,
    connectedScrapers: scrapersStore.connectedScrapers.length,
    runningScrapers: scrapersStore.runningScrapers.length,
    totalWorkers: scrapersStore.totalWorkers,
    activeWorkers: scrapersStore.activeWorkers,
    overallProgress: scrapersStore.overallProgress,
    totalProcessed,
    totalItems,
    totalBytes,
    avgRate,
  };
});
</script>

<template>
  <NSpin :show="scrapersStore.loading">
    <NGrid :cols="4" :x-gap="16" :y-gap="16">
      <NGi>
        <NCard>
          <NStatistic label="Total Scrapers" :value="stats.scrapers">
            <template #suffix>
              <NText :depth="3" class="text-sm">
                ({{ stats.connectedScrapers }} online)
              </NText>
            </template>
          </NStatistic>
        </NCard>
      </NGi>

      <NGi>
        <NCard>
          <NStatistic label="Running Scrapers" :value="stats.runningScrapers">
            <template #suffix>
              <NText type="success" class="text-sm">active</NText>
            </template>
          </NStatistic>
        </NCard>
      </NGi>

      <NGi>
        <NCard>
          <NStatistic label="Total Workers" :value="stats.totalWorkers">
            <template #suffix>
              <NText :depth="3" class="text-sm">
                ({{ stats.activeWorkers }} active)
              </NText>
            </template>
          </NStatistic>
        </NCard>
      </NGi>

      <NGi>
        <NCard>
          <NStatistic
            label="Items Processed"
            :value="formatNumber(stats.totalProcessed)"
          >
            <template #suffix>
              <NText :depth="3" class="text-sm">
                / {{ formatNumber(stats.totalItems) }}
              </NText>
            </template>
          </NStatistic>
        </NCard>
      </NGi>

      <NGi :span="2">
        <NCard title="Overall Progress">
          <NSpace vertical>
            <NProgress
              type="line"
              :percentage="stats.overallProgress"
              :show-indicator="true"
              :height="24"
              :border-radius="4"
              :fill-border-radius="4"
              indicator-placement="inside"
              processing
            />
            <NSpace justify="space-between">
              <NText :depth="3">
                {{ formatBytes(stats.totalBytes) }} downloaded
              </NText>
              <NText :depth="3">
                {{ formatRate(stats.avgRate) }} avg rate
              </NText>
            </NSpace>
          </NSpace>
        </NCard>
      </NGi>

      <NGi :span="2">
        <NCard title="Worker Distribution">
          <NSpace vertical :size="12">
            <NSpace justify="space-between" align="center">
              <NText>Active</NText>
              <NProgress
                type="line"
                :percentage="
                  stats.totalWorkers > 0
                    ? (stats.activeWorkers / stats.totalWorkers) * 100
                    : 0
                "
                :show-indicator="false"
                status="success"
                class="worker-distribution-bar"
              />
              <NText>{{ stats.activeWorkers }}</NText>
            </NSpace>
            <NSpace justify="space-between" align="center">
              <NText>Idle</NText>
              <NProgress
                type="line"
                :percentage="
                  stats.totalWorkers > 0
                    ? ((stats.totalWorkers - stats.activeWorkers) /
                        stats.totalWorkers) *
                      100
                    : 0
                "
                :show-indicator="false"
                status="warning"
                class="worker-distribution-bar"
              />
              <NText>{{ stats.totalWorkers - stats.activeWorkers }}</NText>
            </NSpace>
          </NSpace>
        </NCard>
      </NGi>
    </NGrid>
  </NSpin>
</template>
