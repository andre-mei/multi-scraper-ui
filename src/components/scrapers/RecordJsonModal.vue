<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRecordsStore } from "@/stores/records";
import JsonTree from "./JsonTree.vue";

/**
 * Shows the JSON of one record (answer to FETCH_RECORD). The parent decides when it is open and
 * which column/record it is about; the data itself comes from the records store.
 */
const props = defineProps<{
  open: boolean;
  /** Name of the JSON column, e.g. "details_json". */
  title: string;
  /** The record id. */
  subtitle: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const recordsStore = useRecordsStore();
const loading = computed(() => recordsStore.loading);
const payload = computed(() => recordsStore.payload);
const view = ref<"tree" | "raw">("tree");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) view.value = "tree";
  },
);

const treeData = computed(() => {
  const raw = payload.value?.json;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
});

const pretty = computed(() => {
  const raw = payload.value?.json;
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
});

async function copy() {
  if (pretty.value) await navigator.clipboard.writeText(pretty.value);
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && props.open) emit("close");
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div v-if="open" class="modal-mask" @click.self="emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div>
          <div class="modal-title">{{ title }}</div>
          <div class="modal-sub">
            {{ subtitle }}
          </div>
        </div>
        <div class="modal-actions">
          <div class="view-toggle">
            <button
              :class="['btn', 'btn-sm', view === 'tree' ? 'btn-primary' : 'btn-secondary']"
              @click="view = 'tree'"
            >
              Tree
            </button>
            <button
              :class="['btn', 'btn-sm', view === 'raw' ? 'btn-primary' : 'btn-secondary']"
              @click="view = 'raw'"
            >
              Raw
            </button>
          </div>
          <button class="btn btn-sm btn-secondary" :disabled="!payload?.json" @click="copy">
            Copy
          </button>
          <button class="btn btn-sm btn-secondary" @click="emit('close')">Close</button>
        </div>
      </div>
      <div class="modal-body">
        <div v-if="loading" class="empty-state">Loading JSON…</div>
        <div v-else-if="treeData == null" class="empty-state">
          No {{ title }} for this record.
        </div>
        <JsonTree v-else-if="view === 'tree'" :data="treeData" />
        <pre v-else class="json-raw">{{ pretty }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.35rem 0.75rem;
  transition: background 0.2s;
}
.btn-sm {
  padding: 0.3rem 0.6rem;
}
.btn-primary {
  background: var(--primary, #0d6efd);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, #0b5ed7);
}
.btn-secondary {
  background: var(--bg-tertiary, #e9ecef);
  color: var(--text-primary, #212529);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--bg-quaternary, #ced4da);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #6c757d);
  font-size: 0.9rem;
}

.view-toggle {
  display: inline-flex;
  gap: 0.2rem;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}

.modal-card {
  width: min(920px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border-color, #333);
}

.modal-title {
  font-weight: 700;
  color: var(--text-primary, #e0e0e0);
}

.modal-sub {
  font-size: 0.8rem;
  color: var(--text-secondary, #a0a0b0);
}

.modal-actions {
  display: flex;
  gap: 0.4rem;
}

.modal-body {
  overflow: auto;
  padding: 0.85rem 1rem 1.1rem;
  min-height: 160px;
}

.json-raw {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #c8e1a8;
}
</style>
