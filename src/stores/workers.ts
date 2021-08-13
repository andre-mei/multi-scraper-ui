import { defineSetupStore } from './defineSetupStore'
import { ref, computed } from 'vue'
import type { Worker } from '@/types'
import { api } from '@/api'

export const useWorkersStore = defineSetupStore('workers', () => {
  // State: scraperId -> Map<workerId, Worker>
  const workersByScraperId = ref<Map<string, Map<string, Worker>>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  function getWorkersForScraper(scraperId: string): Worker[] {
    const workers = workersByScraperId.value.get(scraperId)
    return workers ? Array.from(workers.values()) : []
  }

  function getWorker(scraperId: string, workerId: string): Worker | undefined {
    return workersByScraperId.value.get(scraperId)?.get(workerId)
  }

  const allWorkers = computed(() => {
    const all: Worker[] = []
    workersByScraperId.value.forEach(workers => {
      all.push(...workers.values())
    })
    return all
  })

  // Actions
  async function fetchWorkers(scraperId: string) {
    loading.value = true
    error.value = null
    try {
      const data = await api.getWorkers(scraperId)
      const workersMap = new Map<string, Worker>()
      data.forEach(worker => {
        workersMap.set(worker.workerId, worker)
      })
      workersByScraperId.value.set(scraperId, workersMap)
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch workers'
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchWorker(scraperId: string, workerId: string) {
    try {
      const data = await api.getWorker(scraperId, workerId)
      let workers = workersByScraperId.value.get(scraperId)
      if (!workers) {
        workers = new Map()
        workersByScraperId.value.set(scraperId, workers)
      }
      workers.set(workerId, data)
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch worker'
      return null
    }
  }

  function updateWorker(worker: Worker) {
    // Create new maps to trigger Vue reactivity
    const newMap = new Map(workersByScraperId.value)
    let workers = newMap.get(worker.scraperId)
    if (!workers) {
      workers = new Map()
    } else {
      workers = new Map(workers)
    }
    workers.set(worker.workerId, worker)
    newMap.set(worker.scraperId, workers)
    workersByScraperId.value = newMap
  }

  function updateWorkersForScraper(scraperId: string, workerList: Worker[]) {
    const workersMap = new Map<string, Worker>()
    workerList.forEach(worker => {
      workersMap.set(worker.workerId, worker)
    })
    // Create new Map reference to trigger Vue reactivity
    const newMap = new Map(workersByScraperId.value)
    newMap.set(scraperId, workersMap)
    workersByScraperId.value = newMap
  }

  function clearWorkersForScraper(scraperId: string) {
    workersByScraperId.value.delete(scraperId)
  }

  return {
    // State
    workersByScraperId,
    loading,
    error,
    // Getters
    getWorkersForScraper,
    getWorker,
    allWorkers,
    // Actions
    fetchWorkers,
    fetchWorker,
    updateWorker,
    updateWorkersForScraper,
    clearWorkersForScraper
  }
})
