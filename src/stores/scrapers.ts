import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Scraper, ScraperStatus } from '@/types'
import { api } from '@/api'

export const useScrapersStore = defineStore('scrapers', () => {
  const scrapers = ref<Map<string, Scraper>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedScraperId = ref<string | null>(null)

  // Getters
  const scraperList = computed(() => Array.from(scrapers.value.values()))

  const selectedScraper = computed(() =>
    selectedScraperId.value ? scrapers.value.get(selectedScraperId.value) : null
  )

  const connectedScrapers = computed(() =>
    scraperList.value.filter(s => s.isConnected)
  )

  const runningScrapers = computed(() =>
    scraperList.value.filter(s => s.status === 'RUNNING')
  )

  const totalWorkers = computed(() =>
    scraperList.value.reduce((sum, s) => sum + s.workerCount, 0)
  )

  const activeWorkers = computed(() =>
    scraperList.value.reduce((sum, s) => sum + s.activeWorkerCount, 0)
  )

  const overallProgress = computed(() => {
    const running = runningScrapers.value
    if (running.length === 0) return 0
    const total = running.reduce((sum, s) => sum + (s.metrics?.overallProgress || 0), 0)
    return total / running.length
  })

  // Actions
  async function fetchScrapers() {
    loading.value = true
    error.value = null
    try {
      const data = await api.getScrapers()
      scrapers.value.clear()
      data.forEach(scraper => {
        hydrateEventsFromHistory(scraper)
        scrapers.value.set(scraper.scraperId, scraper)
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch scrapers'
    } finally {
      loading.value = false
    }
  }

  async function fetchScraper(scraperId: string) {
    try {
      const data = await api.getScraper(scraperId)
      hydrateEventsFromHistory(data)
      scrapers.value.set(scraperId, data)
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch scraper'
      return null
    }
  }

  /**
   * Populate events from server-persisted statusHistory.
   * Server statusHistory is the single source of truth — no local event creation.
   */
  function hydrateEventsFromHistory(scraper: Scraper) {
    if (scraper.statusHistory && scraper.statusHistory.length > 0) {
      scraper.events = scraper.statusHistory.map(entry => ({
        type: entry.status,
        severity: entry.status === 'ERROR' ? 'error' : entry.status === 'DISCONNECTED' ? 'warning' : 'info',
        stage: entry.stage ?? null,
        message: entry.message || `Status: ${entry.status}`,
        timestamp: entry.timestamp
      }))
    } else {
      scraper.events = []
    }
  }

  /**
   * Full scraper update (from HEALTH_UPDATE or fetch).
   * Replaces scraper data and rebuilds events from server statusHistory.
   */
  function updateScraper(scraper: Scraper) {
    hydrateEventsFromHistory(scraper)
    scrapers.value.set(scraper.scraperId, scraper)
  }

  /**
   * Status change update (from SCRAPER_STATUS_CHANGE).
   * Updates status + replaces events from the included statusHistory.
   */
  function updateScraperStatus(scraperId: string, status: ScraperStatus, currentStage?: string, statusHistory?: import('@/types').StatusHistoryEntry[]) {
    const scraper = scrapers.value.get(scraperId)
    if (scraper) {
      const updated = { ...scraper, status, ...(currentStage !== undefined ? { currentStage } : {}) }
      if (statusHistory && statusHistory.length > 0) {
        updated.statusHistory = statusHistory
      }
      hydrateEventsFromHistory(updated)
      scrapers.value.set(scraperId, updated)
    }
  }

  function removeScraper(scraperId: string) {
    scrapers.value.delete(scraperId)
    if (selectedScraperId.value === scraperId) {
      selectedScraperId.value = null
    }
  }

  function selectScraper(scraperId: string | null) {
    selectedScraperId.value = scraperId
  }

  async function deleteScraperFromRegistry(scraperId: string) {
    try {
      await api.removeScraper(scraperId)
      removeScraper(scraperId)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete scraper'
      return false
    }
  }

  // ========== NEW gRPC-based State Methods ==========

  /**
   * Add a scraper event (from gRPC status stream)
   */
  function addScraperEvent(scraperId: string, event: {
    type: string
    severity: string
    message: string
    metadata?: Record<string, string>
    timestamp: string
  }) {
    const scraper = scrapers.value.get(scraperId)
    if (scraper) {
      const events = [...(scraper.events || [])]

      events.unshift(event)
      if (events.length > 200) events.pop()
      scrapers.value.set(scraperId, { ...scraper, events, lastEventAt: event.timestamp })
    }
  }

  /**
   * Set test execution status for a scraper
   */
  function setTestStatus(scraperId: string, testStatus: {
    running: boolean
    testId?: string
    testType?: string
    progress?: number
    correlationId?: string
    success?: boolean
    summary?: string
    errors?: string[]
    completedAt?: string
  }) {
    const scraper = scrapers.value.get(scraperId)
    if (scraper) {
      scrapers.value.set(scraperId, { ...scraper, testStatus })
    }
  }

  /**
   * Update test progress
   */
  function updateTestProgress(scraperId: string, progress: number, currentStep: string) {
    const scraper = scrapers.value.get(scraperId)
    if (scraper?.testStatus) {
      scrapers.value.set(scraperId, {
        ...scraper,
        testStatus: { ...scraper.testStatus, progress, currentStep }
      })
    }
  }

  /**
   * Update gRPC connection state
   */
  function updateGrpcState(scraperId: string, state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING', details: string) {
    const scraper = scrapers.value.get(scraperId)
    if (scraper) {
      scrapers.value.set(scraperId, {
        ...scraper,
        grpcState: { state, details, updatedAt: new Date().toISOString() },
        isConnected: state === 'CONNECTED'
      })
    }
  }

  return {
    // State
    scrapers,
    loading,
    error,
    selectedScraperId,
    // Getters
    scraperList,
    selectedScraper,
    connectedScrapers,
    runningScrapers,
    totalWorkers,
    activeWorkers,
    overallProgress,
    // Actions
    fetchScrapers,
    fetchScraper,
    updateScraper,
    updateScraperStatus,
    removeScraper,
    selectScraper,
    deleteScraperFromRegistry,
    // NEW gRPC-based actions
    addScraperEvent,
    setTestStatus,
    updateTestProgress,
    updateGrpcState
  }
})
