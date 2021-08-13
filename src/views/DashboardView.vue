<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { NCard, NH2, NText, NDivider } from "naive-ui";
import { useScrapersStore } from "@/stores/scrapers";
import StatsOverview from "@/components/dashboard/StatsOverview.vue";
import ScraperTable from "@/components/scrapers/ScraperTable.vue";
import LogViewer from "@/components/logs/LogViewer.vue";

const router = useRouter();
const scrapersStore = useScrapersStore();

function handleScraperSelect(scraperId: string) {
  router.push(`/scrapers/${scraperId}`);
}

onMounted(() => {
  scrapersStore.fetchScrapers();
});
</script>

<template>
  <div class="space-y-6">
    <NH2>Dashboard</NH2>

    <!-- Stats Overview -->
    <StatsOverview />

    <NDivider />

    <!-- Active Scrapers Table -->
    <NCard title="Active Scrapers">
      <ScraperTable @select="handleScraperSelect" />
    </NCard>

    <NDivider />

    <!-- Recent Activity / Logs Preview -->
    <NCard title="Recent Activity">
      <template #header-extra>
        <NText depth="3" class="text-sm"> Last logs from all scrapers </NText>
      </template>
      <div v-if="scrapersStore.scraperList.length > 0">
        <LogViewer
          :scraper-id="scrapersStore.scraperList[0]?.scraperId"
          :max-height="300"
          :auto-initialize="false"
        />
      </div>
      <NText v-else depth="3"> No scrapers connected yet </NText>
    </NCard>
  </div>
</template>
