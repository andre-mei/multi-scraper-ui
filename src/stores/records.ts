import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { RecordJsonPayload } from '@/types'

interface RecordRef {
  scraperId: string
  tableName: string
  recordId: string
}

/** The one record JSON the viewer modal is showing (or waiting for). */
export const useRecordsStore = defineStore('records', () => {
  const current = ref<RecordRef | null>(null)
  const loading = ref(false)
  const payload = ref<RecordJsonPayload | null>(null)

  async function request(scraperId: string, tableName: string, recordId: string) {
    current.value = { scraperId, tableName, recordId }
    payload.value = null
    loading.value = true
    try {
      await api.fetchRecord(scraperId, tableName, recordId)
    } catch (e) {
      console.error('Failed to fetch record JSON:', e)
      loading.value = false
    }
  }

  /** Ignore answers that do not match the pending request (stale-response guard). */
  function handle(incoming: RecordJsonPayload) {
    const c = current.value
    if (!c || c.scraperId !== incoming.scraperId || c.tableName !== incoming.tableName || c.recordId !== String(incoming.recordId)) {
      return
    }
    payload.value = incoming
    loading.value = false
  }

  function clear() {
    current.value = null
    payload.value = null
    loading.value = false
  }

  return { current, loading, payload, request, handle, clear }
})
