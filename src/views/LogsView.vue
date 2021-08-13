<script setup lang="ts">
import { ref, computed } from "vue";
import { useScrapersStore } from "@/stores/scrapers";
import LogViewer from "@/components/logs/LogViewer.vue";

const scrapersStore = useScrapersStore();

const selectedScraperId = ref<string | null>(null);
const selectedWorkerId = ref<string | null>(null);

const scraperOptions = computed(() =>
  scrapersStore.scraperList.map((s) => ({
    label: s.name || s.scraperId,
    value: s.scraperId,
  })),
);

function handleScraperChange(value: string | null) {
  selectedScraperId.value = value;
  selectedWorkerId.value = null;
}
</script>

<template>
  <div class="logs-view-page">
    <!-- Header - fixed at top -->
    <div
      class="logs-view-header flex items-center justify-between mb-4 flex-shrink-0"
    >
      <h2 class="page-title">Logs</h2>
      <div class="filter-controls">
        <select
          :value="selectedScraperId"
          @change="
            handleScraperChange(
              ($event.target as HTMLSelectElement).value || null,
            )
          "
          class="scraper-select"
        >
          <!-- This acts as a placeholder: -->
          <!-- 'disabled' prevents selection, 'hidden' hides it from the list -->
          <option value="" disabled selected hidden>Select Scraper</option>

          <option
            v-for="option in scraperOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Log viewer card - fills remaining space -->
    <div class="logs-viewer-card">
      <div v-if="!selectedScraperId" class="logs-empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
          />
        </svg>
        <p class="empty-message">Select a scraper to view logs</p>
      </div>
      <LogViewer
        v-else
        :scraper-id="selectedScraperId"
        :worker-id="selectedWorkerId || undefined"
        :fill-height="true"
      />
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   LOGS VIEW PAGE
   ============================================ */
.logs-view-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  /*padding: 20px;*/
  overflow: hidden;
}

/* ============================================
   LOGS VIEW HEADER
   ============================================ */
.logs-view-header {
  flex-shrink: 0;
  padding-bottom: 12px;
  padding-right: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
}

/* Filter Controls */
.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scraper-select {
  min-width: 220px;
  height: 36px;
  padding: 0 32px 0 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid transparent;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3.14645 5.64645C3.34171 5.45118 3.65829 5.45118 3.85355 5.64645L8 9.79289L12.1464 5.64645C12.3417 5.45118 12.6583 5.45118 12.8536 5.64645C13.0488 5.84171 13.0488 6.15829 12.8536 6.35355L8.35355 10.8536C8.15829 11.0488 7.84171 11.0488 7.64645 10.8536L3.14645 6.35355C2.95118 6.15829 2.95118 5.84171 3.14645 5.64645Z' fill='rgba(255,255,255,0.6)'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 18px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.scraper-select:hover {
  border-color: #7fe7c4;
  background-color: rgba(255, 255, 255, 0.12);
}

.scraper-select:focus {
  border-color: #7fe7c4;
  background-color: rgba(99, 226, 183, 0.1);
  box-shadow: 0 0 8 px 0 rgba(99, 226, 183, 0.3);
}

.scraper-select option {
  background: #18181c;
  color: rgba(255, 255, 255, 0.82);
  padding: 8px;
}

/* ============================================
   LOGS VIEWER CARD
   ============================================ */
.logs-viewer-card {
  flex: 1;
  min-height: 0;
  margin-top: 0px;
  /*padding: 16px;*/
  background: #18181c;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ============================================
   EMPTY STATE
   ============================================ */
.logs-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.38);
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-message {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

/* ============================================
   UTILITY CLASSES
   ============================================ */
.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.mb-4 {
  margin-bottom: 0px;
}

.flex-shrink-0 {
  flex-shrink: 0;
}
</style>
