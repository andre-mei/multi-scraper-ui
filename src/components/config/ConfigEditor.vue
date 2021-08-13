<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  NCard,
  NForm,
  NFormItem,
  NInputNumber,
  NSwitch,
  NButton,
  NSpace,
  NSpin,
  useMessage
} from 'naive-ui'
import type { Scraper, ScraperConfig } from '@/types'
import { api } from '@/api'
import { SETTINGS, NEWEST_FIRST_CRAWL } from '@/composables/usePhases'

const props = defineProps<{
  scraper: Scraper
}>()

const emit = defineEmits<{
  (e: 'updated'): void
}>()

const message = useMessage()
const loading = ref(false)
const fetchingConfig = ref(false)

// The fixed config fields, plus the switches the scraper reports in `customSettings` (newestFirstCrawl).
const settings = computed(() =>
  props.scraper.config?.customSettings && NEWEST_FIRST_CRAWL.key in props.scraper.config.customSettings
    ? [...SETTINGS, NEWEST_FIRST_CRAWL]
    : SETTINGS
)

/** What the form edits, and the values it was loaded with (to find what changed). */
const form = ref<Record<string, unknown>>({})
const saved = ref<Record<string, unknown>>({})

const asNumber = (v: unknown) => (typeof v === 'number' ? v : null)
const asBool = (v: unknown) => v === true

/** A missing value counts as the empty one of its type, so "not set" and "empty" are not a change. */
function normalized(type: string, v: unknown): unknown {
  return type === 'BOOL' ? asBool(v) : asNumber(v)
}

function load(config: ScraperConfig | null | undefined) {
  const values: Record<string, unknown> = { ...config, ...config?.customSettings }
  const loaded: Record<string, unknown> = {}
  for (const s of settings.value) loaded[s.key] = normalized(s.type, values[s.key])
  saved.value = loaded
  form.value = JSON.parse(JSON.stringify(loaded))
}

// Fetch the values from the Manager when the scraper changes
async function fetchConfig() {
  if (!props.scraper?.scraperId) return

  fetchingConfig.value = true
  try {
    load((await api.getConfig(props.scraper.scraperId)) ?? props.scraper.config)
  } catch (e) {
    console.error('Failed to fetch config:', e)
    load(props.scraper.config)
  } finally {
    fetchingConfig.value = false
  }
}

watch(
  // A string, so a HEALTH that replaces the scraper object does not re-fetch (and wipe what is being typed)
  () => `${props.scraper?.scraperId}|${settings.value.map(s => s.key).join()}`,
  () => {
    fetchConfig()
  },
  { immediate: true }
)

/** Only the fields whose value differs from what was loaded; switches go inside `customSettings`. */
const changes = computed(() => {
  const out: Record<string, unknown> = {}
  const custom: Record<string, unknown> = {}
  for (const s of settings.value) {
    const now = normalized(s.type, form.value[s.key])
    if (JSON.stringify(now) !== JSON.stringify(saved.value[s.key])) (s.custom ? custom : out)[s.key] = now
  }
  if (Object.keys(custom).length > 0) out.customSettings = custom
  return out as Partial<ScraperConfig>
})
const hasChanges = computed(() => Object.keys(changes.value).length > 0)

async function saveConfig() {
  loading.value = true
  try {
    console.log('[UI->Manager] Saving config for', props.scraper.scraperId, changes.value)
    const response = await api.updateConfig(props.scraper.scraperId, changes.value)
    if (response.success) {
      console.log('[UI<-Manager] Config saved successfully:', response)
      message.success('Configuration saved and sent to scraper')
      emit('updated')
      await fetchConfig()
    } else {
      console.warn('[UI<-Manager] Config save failed:', response.message)
      message.error(response.message || 'Failed to save configuration')
    }
  } catch (e) {
    console.error('[UI<-Manager] Config save error:', e)
    message.error(e instanceof Error ? e.message : 'Failed to save configuration')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  // Re-fetch from the Manager to get the current saved values
  fetchConfig()
}
</script>

<template>
  <NCard title="Configuration">
    <NSpin :show="fetchingConfig">
      <NForm
        :model="form"
        label-placement="left"
        label-width="140px"
        size="small"
      >
        <NFormItem
          v-for="s in settings"
          :key="s.key"
          :label="s.label"
          :feedback="s.help || undefined"
        >
          <NInputNumber
            v-if="s.type === 'INT' || s.type === 'LONG'"
            :value="asNumber(form[s.key])"
            :min="s.min ?? undefined"
            :max="s.max ?? undefined"
            @update:value="v => (form[s.key] = v)"
          />
          <NSwitch
            v-else
            :value="asBool(form[s.key])"
            @update:value="v => (form[s.key] = v)"
          />
        </NFormItem>

        <NFormItem>
          <NSpace>
            <NButton
              type="primary"
              :loading="loading"
              :disabled="!hasChanges || fetchingConfig"
              @click="saveConfig"
            >
              Save Configuration
            </NButton>
            <NButton @click="resetForm" :disabled="fetchingConfig">
              Reset
            </NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NSpin>
  </NCard>
</template>
