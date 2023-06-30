<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
  NButton,
  NSpace,
  NDynamicInput,
  NSpin,
  NEmpty,
  useMessage
} from 'naive-ui'
import type { Scraper } from '@/types'
import { api } from '@/api'
import { useFlavor } from '@/composables/useFlavor'

const props = defineProps<{
  scraper: Scraper
}>()

const emit = defineEmits<{
  (e: 'updated'): void
}>()

const message = useMessage()
const loading = ref(false)
const fetchingConfig = ref(false)

// The form is the flavor's `settings`; the Manager and this component know no setting key.
const { settings } = useFlavor(() => props.scraper)

/** What the form edits, and the values it was loaded with (to find what changed). */
const form = ref<Record<string, unknown>>({})
const saved = ref<Record<string, unknown>>({})

const asNumber = (v: unknown) => (typeof v === 'number' ? v : null)
const asString = (v: unknown) => (typeof v === 'string' ? v : '')
const asBool = (v: unknown) => v === true
const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])

/** A missing value counts as the empty one of its type, so "not set" and "empty" are not a change. */
function normalized(type: string, v: unknown): unknown {
  switch (type) {
    case 'INT':
    case 'LONG': return asNumber(v)
    case 'BOOL': return asBool(v)
    case 'STRING_LIST': return asList(v)
    default: return asString(v)
  }
}

function load(values: Record<string, unknown> | null | undefined) {
  const loaded: Record<string, unknown> = {}
  for (const s of settings.value) loaded[s.key] = normalized(s.type, values?.[s.key])
  saved.value = loaded
  form.value = JSON.parse(JSON.stringify(loaded))
}

// Fetch the values from the Manager when the scraper changes
async function fetchConfig() {
  if (!props.scraper?.scraperId) return

  fetchingConfig.value = true
  try {
    load((await api.getConfig(props.scraper.scraperId)) ?? props.scraper.settingsValues)
  } catch (e) {
    console.error('Failed to fetch config:', e)
    load(props.scraper.settingsValues)
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

/** Only the keys whose value differs from what was loaded. */
const changes = computed(() => {
  const out: Record<string, unknown> = {}
  for (const s of settings.value) {
    const now = normalized(s.type, form.value[s.key])
    if (JSON.stringify(now) !== JSON.stringify(saved.value[s.key])) out[s.key] = now
  }
  return out
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
    <NEmpty v-if="settings.length === 0" description="This scraper declares no settings." />
    <NSpin v-else :show="fetchingConfig">
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
          >
            <template v-if="s.unit" #suffix>{{ s.unit }}</template>
          </NInputNumber>
          <NSwitch
            v-else-if="s.type === 'BOOL'"
            :value="asBool(form[s.key])"
            @update:value="v => (form[s.key] = v)"
          />
          <NDynamicInput
            v-else-if="s.type === 'STRING_LIST'"
            :value="asList(form[s.key])"
            @update:value="v => (form[s.key] = v)"
          />
          <NInput
            v-else
            :value="asString(form[s.key])"
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
