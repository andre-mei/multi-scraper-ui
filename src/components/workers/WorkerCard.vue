<script setup lang="ts">
import { computed } from "vue";
import { NCard, NTag, NText, NSpace, NProgress, NTooltip } from "naive-ui";
import type { Worker } from "@/types";
import { useRouter } from "vue-router";
import { useStatusColors } from "@/composables/useStatusColors";
import { useFormatters } from "@/composables/useFormatters";
import { useScrapersStore } from "@/stores/scrapers";

const props = defineProps<{
  worker: Worker;
}>();

const router = useRouter();
const scrapersStore = useScrapersStore();
const { getStatusType } = useStatusColors();
const { formatNumber, formatPercent, formatRate } = useFormatters();

const scraperPaused = computed(
  () => scrapersStore.scrapers.get(props.worker.scraperId)?.status === "PAUSED",
);
const displayStatus = computed(() =>
  scraperPaused.value && props.worker.status !== "PAUSED"
    ? "PAUSED"
    : props.worker.status,
);

const progress = computed(() => {
  const total = props.worker.metrics?.totalItems || 0;
  const processed = props.worker.metrics?.processedItems || 0;
  return total > 0
    ? Math.round((processed / total) * 100)
    : props.worker.metrics?.progressPercent || 0;
});

function navigateToWorker() {
  router.push(
    `/scrapers/${props.worker.scraperId}/workers/${props.worker.workerId}`,
  );
}
</script>

<template>
  <NCard
    size="small"
    class="cursor-pointer hover:border-[#18a058] transition-colors"
    @click="navigateToWorker"
  >
    <div class="space-y-3">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <NSpace align="center" :size="8">
          <NText class="text-sm font-medium">{{
            worker.name || worker.workerId
          }}</NText>
          <NTag :type="getStatusType(displayStatus)" size="tiny" round>
            {{ displayStatus }}
          </NTag>
        </NSpace>
      </div>

      <!-- Proxy -->
      <NText v-if="worker.proxyIp" code depth="3" class="text-xs block">
        {{ worker.proxyIp }}:{{ worker.proxyPort }}
      </NText>

      <!-- Progress -->
      <NTooltip>
        <template #trigger>
          <NProgress
            type="line"
            :percentage="progress"
            :height="6"
            :border-radius="3"
            :fill-border-radius="3"
            :show-indicator="false"
            :status="
              worker.status === 'ERROR'
                ? 'error'
                : worker.status === 'RUNNING'
                  ? 'success'
                  : worker.status === 'INITIALIZING'
                    ? 'info'
                    : 'default'
            "
          />
        </template>
        {{ formatPercent(progress) }}
      </NTooltip>

      <!-- Stats Row -->
      <div class="flex items-center justify-between text-xs">
        <NText depth="3">
          {{ formatNumber(worker.metrics?.processedItems || 0) }} items
        </NText>
        <NText depth="3">
          {{ formatRate(worker.metrics?.itemsPerSecond || 0) }}
        </NText>
        <NText :type="(worker.detectionCount || 0) > 0 ? 'warning' : 'default'">
          {{ worker.detectionCount || 0 }} det
        </NText>
      </div>
    </div>
  </NCard>
</template>
