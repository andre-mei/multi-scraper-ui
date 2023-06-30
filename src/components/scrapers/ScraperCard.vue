<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NProgress, NTooltip } from 'naive-ui'
import type { Scraper } from '@/types'
import { useRouter } from 'vue-router'
import { useStatusColors } from '@/composables/useStatusColors'
import { useFormatters } from '@/composables/useFormatters'
import { useFlavor } from '@/composables/useFlavor'

const props = defineProps<{
  scraper: Scraper
}>()

const router = useRouter()
const { stageText } = useFlavor(() => props.scraper)
const { getStatusType } = useStatusColors()
const { formatNumber, formatRelativeTime, formatPercent, formatRate } = useFormatters()

const progress = computed(() => props.scraper.metrics?.overallProgress || 0)

function navigateToScraper() {
  router.push(`/scrapers/${props.scraper.scraperId}`)
}
</script>

<template>
  <NCard 
    class="cursor-pointer hover:border-[#18a058] transition-colors"
    @click="navigateToScraper"
  >
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <NSpace align="center">
          <NText strong>{{ scraper.name || scraper.scraperId }}</NText>
          <NTag :type="getStatusType(scraper.status)" size="small" round>
            {{ scraper.status }}
          </NTag>
        </NSpace>
        <NText depth="3" class="text-xs">
          {{ formatRelativeTime(scraper.lastHeartbeat) }}
        </NText>
      </div>

      <!-- Progress -->
      <NTooltip>
        <template #trigger>
          <NProgress
            type="line"
            :percentage="progress"
            :height="8"
            :border-radius="4"
            :fill-border-radius="4"
            :show-indicator="false"
            :status="scraper.status === 'ERROR' ? 'error' : scraper.status === 'RUNNING' ? 'success' : 'default'"
            :processing="scraper.status === 'RUNNING'"
          />
        </template>
        {{ formatPercent(progress) }} complete
      </NTooltip>

      <!-- Stats -->
      <NGrid :cols="3" :x-gap="8">
        <NGi>
          <div class="text-center">
            <NText depth="3" class="text-xs block">Items</NText>
            <NText class="text-sm">
              {{ formatNumber(scraper.metrics?.processedItems || 0) }}
            </NText>
          </div>
        </NGi>
        <NGi>
          <div class="text-center">
            <NText depth="3" class="text-xs block">Workers</NText>
            <NText class="text-sm">
              <span class="text-[#18a058]">{{ scraper.activeWorkerCount }}</span>
              /{{ scraper.workerCount }}
            </NText>
          </div>
        </NGi>
        <NGi>
          <div class="text-center">
            <NText depth="3" class="text-xs block">Rate</NText>
            <NText class="text-sm">
              {{ formatRate(scraper.metrics?.itemsPerSecond || 0) }}
            </NText>
          </div>
        </NGi>
      </NGrid>

      <!-- Stage -->
      <div v-if="scraper.currentStage" class="flex items-center gap-2">
        <NText depth="3" class="text-xs">Stage:</NText>
        <NText class="text-xs">{{ stageText(scraper.currentStage) }}</NText>
      </div>
    </div>
  </NCard>
</template>
