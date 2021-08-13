<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NH2, NButton, NSpace } from 'naive-ui'
import { useScrapersStore } from '@/stores/scrapers'
import ScraperTable from '@/components/scrapers/ScraperTable.vue'

const router = useRouter()
const scrapersStore = useScrapersStore()

function handleScraperSelect(scraperId: string) {
  router.push(`/scrapers/${scraperId}`)
}

function refreshScrapers() {
  scrapersStore.fetchScrapers()
}

onMounted(() => {
  scrapersStore.fetchScrapers()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <NH2>Scrapers</NH2>
      <NSpace>
        <NButton @click="refreshScrapers" :loading="scrapersStore.loading">
          Refresh
        </NButton>
      </NSpace>
    </div>
    
    <NCard>
      <ScraperTable @select="handleScraperSelect" />
    </NCard>
  </div>
</template>
