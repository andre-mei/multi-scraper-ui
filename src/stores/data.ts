import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { DataUpdatePayload } from '@/types'

export const useDataStore = defineStore('data', () => {
  // tableName → records
  const tableData = ref<Record<string, Record<string, unknown>[]>>({})
  const tableTotalCounts = ref<Record<string, number>>({})
  const tableBufferSizes = ref<Record<string, number>>({})
  const loading = ref<Record<string, boolean>>({})

  function getKey(scraperId: string, tableName: string) {
    return `${scraperId}:${tableName}`
  }

  async function fetchData(scraperId: string, tableName: string) {
    const key = getKey(scraperId, tableName)
    loading.value[key] = true
    try {
      await api.fetchScraperData(scraperId, tableName)
    } catch (e) {
      console.error('Failed to fetch data:', e)
    }
    // Don't clear loading here — it will be cleared when DATA_UPDATE arrives
  }

  async function loadBufferedData(scraperId: string, tableName: string) {
    const key = getKey(scraperId, tableName)
    loading.value[key] = true
    try {
      const response = await api.getScraperData(scraperId, tableName)
      tableData.value[key] = response.records
      tableTotalCounts.value[key] = response.totalCount
      tableBufferSizes.value[key] = response.bufferSize
    } catch (e) {
      console.error('Failed to load buffered data:', e)
    } finally {
      loading.value[key] = false
    }
  }

  function handleDataUpdate(payload: DataUpdatePayload) {
    const key = getKey(payload.scraperId, payload.tableName)
    // Replace with full records from the update
    tableData.value[key] = payload.records
    tableTotalCounts.value[key] = payload.totalCount
    tableBufferSizes.value[key] = payload.bufferSize
    loading.value[key] = false
  }

  async function clearData(scraperId: string, tableName: string) {
    const key = getKey(scraperId, tableName)
    try {
      await api.clearScraperData(scraperId, tableName)
      tableData.value[key] = []
      tableTotalCounts.value[key] = 0
      tableBufferSizes.value[key] = 0
    } catch (e) {
      console.error('Failed to clear data:', e)
    }
  }

  function getRecords(scraperId: string, tableName: string) {
    return tableData.value[getKey(scraperId, tableName)] ?? []
  }

  function getTotalCount(scraperId: string, tableName: string) {
    return tableTotalCounts.value[getKey(scraperId, tableName)] ?? 0
  }

  function getBufferSize(scraperId: string, tableName: string) {
    return tableBufferSizes.value[getKey(scraperId, tableName)] ?? 0
  }

  function isLoading(scraperId: string, tableName: string) {
    return loading.value[getKey(scraperId, tableName)] ?? false
  }

  return {
    tableData,
    tableTotalCounts,
    tableBufferSizes,
    loading,
    fetchData,
    loadBufferedData,
    handleDataUpdate,
    clearData,
    getRecords,
    getTotalCount,
    getBufferSize,
    isLoading
  }
})
