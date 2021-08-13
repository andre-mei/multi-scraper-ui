<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { NH2, NSpace, NSelect, NEmpty, NText } from "naive-ui";
import { useScrapersStore } from "@/stores/scrapers";
import ConfigEditor from "@/components/config/ConfigEditor.vue";

const scrapersStore = useScrapersStore();

const selectedScraperId = ref<string | null>(null);

const scraperOptions = computed(() =>
  scrapersStore.scraperList.map((s) => ({
    label: s.name || s.scraperId,
    value: s.scraperId,
  })),
);

const selectedScraper = computed(() =>
  selectedScraperId.value
    ? scrapersStore.scrapers.get(selectedScraperId.value)
    : null,
);

// Log when scraper is selected
watch(selectedScraperId, (newId) => {
  if (newId) {
    console.log("[UI] Selected scraper for config:", newId);
  }
});

function handleConfigUpdated() {
  console.log("[UI] Config updated, refreshing scraper data");
  if (selectedScraperId.value) {
    scrapersStore.fetchScraper(selectedScraperId.value);
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <NH2>Configuration</NH2>
      <NSpace align="center">
        <NText depth="3">Select scraper:</NText>
        <NSelect
          v-model:value="selectedScraperId"
          :options="scraperOptions"
          placeholder="Select Scraper"
          clearable
          class="scraper-select"
        />
      </NSpace>
    </div>

    <NEmpty
      v-if="!selectedScraper"
      description="Select a scraper to edit configuration"
    />
    <ConfigEditor
      v-else
      :scraper="selectedScraper"
      @updated="handleConfigUpdated"
    />
  </div>
</template>

<style scoped>
.scraper-select {
  width: 250px;
}
</style>
