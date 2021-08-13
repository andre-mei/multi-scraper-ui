<script setup lang="ts">
import { ref, computed } from "vue";
import { NSpace, NButton, NPopconfirm, NDropdown, useMessage } from "naive-ui";
import type { CommandType, Scraper, ScraperStatus } from "@/types";
import { useCommandsStore } from "@/stores/commands";
import { nextPhase, RESUMABLE_PHASES } from "@/composables/usePhases";

const props = defineProps<{
  scraperId: string;
  workerId?: string;
  workerIds?: string[];
  disabled?: boolean;
  scraperStatus?: ScraperStatus;
  /** The scraper these buttons control; its current phase names the Continue button. */
  scraper?: Scraper | null;
}>();

const commandsStore = useCommandsStore();
const message = useMessage();
const loading = ref(false);

// Status helper computeds
const isRunning = computed(() => props.scraperStatus === "RUNNING");
const isPaused = computed(() => props.scraperStatus === "PAUSED");
const isWaitingApproval = computed(
  () => props.scraperStatus === "WAITING_APPROVAL",
);

// Main button configuration based on scraper status
const mainButtonConfig = computed(() => {
  if (isPaused.value) {
    return {
      label: "Resume",
      command: "RESUME" as CommandType,
      type: "success" as const,
      disabled: props.disabled || loading.value,
    };
  }

  if (isWaitingApproval.value) {
    const next = nextPhase(props.scraper?.currentPhase);
    return {
      label: next ? `Continue ${next.label}` : "Continue",
      command: "ADVANCE_PHASE" as CommandType,
      type: "success" as const,
      disabled: props.disabled || loading.value,
    };
  }

  if (isRunning.value) {
    return {
      label: "Start",
      command: "START" as CommandType,
      type: "success" as const,
      disabled: true, // Disabled while running
    };
  }

  // Default: IDLE, COMPLETED, ERROR, VALIDATION_FAILED
  return {
    label: "Start",
    command: "START" as CommandType,
    type: "success" as const,
    disabled: props.disabled || loading.value,
  };
});

// Pause button: enabled only when RUNNING
const pauseDisabled = computed(
  () => props.disabled || loading.value || !isRunning.value,
);

// Abort button: enabled when RUNNING or PAUSED
const abortDisabled = computed(
  () =>
    props.disabled || loading.value || (!isRunning.value && !isPaused.value),
);

async function sendCommand(type: CommandType) {
  loading.value = true;
  try {
    const response = await commandsStore.sendCommand(props.scraperId, type, {
      workerId: props.workerId,
      workerIds: props.workerIds,
    });

    if (response?.success) {
      message.success(`Command ${type} sent successfully`);
    } else {
      message.error(response?.message || "Failed to send command");
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : "Failed to send command");
  } finally {
    loading.value = false;
  }
}

const moreOptions = computed(() => {
  const runActive = isRunning.value || isPaused.value;
  return [
    ...RESUMABLE_PHASES.map((p) => ({
      label: `Resume from ${p.label}`,
      key: p.resumeCommand as string,
      disabled: runActive,
    })),
    { label: "Clear Cache", key: "CLEAR_CACHE" },
    { label: "Refresh Proxies", key: "REFRESH_PROXIES" },
    { label: "Force Health Report", key: "FORCE_HEALTH_REPORT" },
  ];
});

function handleMoreSelect(key: string) {
  sendCommand(key as CommandType);
}
</script>

<template>
  <NSpace class="command-buttons">
    <!-- Main action button: Start / Resume / Continue <next phase> -->
    <NButton
      class="cmd-btn cmd-btn--main"
      :type="mainButtonConfig.type"
      :disabled="mainButtonConfig.disabled"
      :loading="loading"
      @click="sendCommand(mainButtonConfig.command)"
    >
      {{ mainButtonConfig.label }}
    </NButton>

    <!-- Pause button: only enabled when RUNNING -->
    <NButton
      class="cmd-btn cmd-btn--pause"
      type="warning"
      :disabled="pauseDisabled"
      :loading="loading"
      @click="sendCommand('PAUSE')"
    >
      Pause
    </NButton>

    <!-- Abort button: enabled when RUNNING or PAUSED -->
    <NPopconfirm @positive-click="sendCommand('ABORT')">
      <template #trigger>
        <NButton
          class="cmd-btn cmd-btn--abort"
          type="error"
          :disabled="abortDisabled"
          :loading="loading"
        >
          Abort
        </NButton>
      </template>
      Are you sure you want to abort? This will stop all processing.
    </NPopconfirm>

    <!-- More options dropdown -->
    <NDropdown
      class="cmd-dropdown"
      trigger="click"
      :options="moreOptions"
      @select="handleMoreSelect"
    >
      <NButton class="cmd-btn cmd-btn--more" :disabled="disabled || loading">
        More ▼
      </NButton>
    </NDropdown>
  </NSpace>
</template>

<style scoped>
.command-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cmd-btn {
  font-weight: 500;
}

.cmd-btn--more {
  min-width: 80px;
}
</style>
