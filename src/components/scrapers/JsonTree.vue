<script lang="ts">
export default { name: "JsonTree" };
</script>
<script setup lang="ts">
import { computed, ref } from "vue";
import JsonTree from "./JsonTree.vue";

const props = withDefaults(
  defineProps<{
    data: unknown;
    name?: string;
    depth?: number;
  }>(),
  { depth: 0 },
);

const expanded = ref(props.depth < 2);

const kind = computed(() => {
  if (props.data === null) return "null";
  if (Array.isArray(props.data)) return "array";
  return typeof props.data;
});

const isExpandable = computed(() => kind.value === "object" || kind.value === "array");

const entries = computed(() => {
  if (kind.value === "array") {
    return (props.data as unknown[]).map((v, i) => [String(i), v] as const);
  }
  if (kind.value === "object" && props.data) {
    return Object.entries(props.data as Record<string, unknown>);
  }
  return [] as [string, unknown][];
});

const preview = computed(() => {
  if (kind.value === "array") return `[${(props.data as unknown[]).length}]`;
  if (kind.value === "object") return `{${entries.value.length}}`;
  if (kind.value === "string") return JSON.stringify(props.data);
  return String(props.data);
});
</script>

<template>
  <div class="json-node" :style="{ paddingLeft: depth === 0 ? '0' : '0.9rem' }">
    <button
      v-if="isExpandable"
      class="json-toggle"
      type="button"
      @click="expanded = !expanded"
    >
      {{ expanded ? "▾" : "▸" }}
      <span v-if="name != null" class="json-key">{{ name }}</span>
      <span class="json-preview">{{ preview }}</span>
    </button>
    <div v-else class="json-leaf">
      <span v-if="name != null" class="json-key">{{ name }}:</span>
      <span :class="['json-val', kind]">{{ preview }}</span>
    </div>
    <div v-if="isExpandable && expanded">
      <JsonTree
        v-for="[k, v] in entries"
        :key="k"
        :name="k"
        :data="v"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.json-node {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.45;
}

.json-toggle,
.json-leaf {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  background: none;
  border: none;
  color: inherit;
  padding: 0.05rem 0;
  text-align: left;
}

.json-toggle {
  cursor: pointer;
  width: 100%;
}

.json-key {
  color: #7dc4ff;
}

.json-preview {
  color: #8b8b9a;
}

.json-val.string {
  color: #98c379;
}
.json-val.number {
  color: #d19a66;
}
.json-val.boolean {
  color: #c678dd;
}
.json-val.null {
  color: #e06c75;
}
</style>
