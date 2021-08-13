import { defineSetupStore } from './defineSetupStore'
import { ref, computed } from 'vue'
import type { LogEntry, LogLevel } from '@/types'
import { api } from '@/api'

/** Stop loading older pages once this many lines are on screen. */
export const MAX_LOGS_IN_MEMORY = 5000

function minimumSequence(logs: Array<{ sequence?: number }>): number | null {
  let oldest = Infinity
  for (const log of logs) {
    if (log.sequence != null && log.sequence < oldest) oldest = log.sequence
  }
  return Number.isFinite(oldest) ? oldest : null
}

export const useLogsStore = defineSetupStore('logs', () => {
  // State: scraperId -> logs array
  const logsByScraperId = ref<Map<string, LogEntry[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Track which scrapers have had their logs initialized (first FETCH_LOGS done)
  // After clear, we don't re-initialize unless user clicks Refresh
  const initializedScrapers = ref<Set<string>>(new Set())
  
  // Track which scrapers have reached the end of their log history (no more older logs)
  const paginationComplete = ref<Set<string>>(new Set())
  
  // Track last beforeSequence sent per scraper to avoid duplicate requests
  const lastPaginationSeq = ref<Map<string, number>>(new Map())

  // Filter state
  const filterLevel = ref<LogLevel | null>(null)
  const filterSearch = ref('')
  const selectedScraperId = ref<string | null>(null)
  const selectedWorkerId = ref<string | null>(null)
  
  // Check if logs have been initialized for a scraper
  function isInitialized(scraperId: string): boolean {
    return initializedScrapers.value.has(scraperId)
  }

  // Getters
  function getLogsForScraper(scraperId: string): LogEntry[] {
    return logsByScraperId.value.get(scraperId) || []
  }

  const filteredLogs = computed(() => {
    if (!selectedScraperId.value) return []
    
    let logs = getLogsForScraper(selectedScraperId.value)
    
    // Filter by worker if selected
    if (selectedWorkerId.value) {
      logs = logs.filter(l => l.workerId === selectedWorkerId.value)
    }
    
    // Filter by level
    if (filterLevel.value) {
      const levels: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
      const minIndex = levels.indexOf(filterLevel.value)
      logs = logs.filter(l => levels.indexOf(l.level) >= minIndex)
    }
    
    // Filter by search
    if (filterSearch.value) {
      const search = filterSearch.value.toLowerCase()
      logs = logs.filter(l =>
        l.message.toLowerCase().includes(search) ||
        l.logger?.toLowerCase().includes(search) ||
        l.context?.toLowerCase().includes(search)
      )
    }
    
    return logs
  })

  // Actions
  async function fetchLogs(scraperId: string, options?: {
    offset?: number
    limit?: number
    level?: string
    search?: string
    workerId?: string
  }) {
    loading.value = true
    error.value = null
    try {
      let data: LogEntry[]
      if (options?.workerId) {
        data = await api.getWorkerLogs(scraperId, options.workerId, options)
      } else {
        data = await api.getLogs(scraperId, options)
      }
      
      // Always sort logs by sequence/timestamp (ascending - oldest first)
      data.sort((a, b) => {
        if (a.sequence != null && b.sequence != null) {
          return a.sequence - b.sequence
        }
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })
      
      if (options?.offset === 0 || !options?.offset) {
        // Fresh fetch (first open, or Refresh). Replaces whatever is stored.
        logsByScraperId.value.set(scraperId, data)
        lastPaginationSeq.value.delete(scraperId)
      } else {
        // Pagination, append logs
        const existing = logsByScraperId.value.get(scraperId) || []
        logsByScraperId.value.set(scraperId, [...existing, ...data])
      }
      
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch logs'
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Add logs to the store for a scraper.
   * Logs are merged, deduplicated by id, and sorted by sequence/timestamp.
   * Stored in ASCENDING order (oldest first), but displayed in descending order (newest first).
   */
  function addLogs(scraperId: string, newLogs: LogEntry[]) {
    const existing = logsByScraperId.value.get(scraperId) || []
    
    // Create maps for deduplication by id and sequence
    const logsById = new Map<string, LogEntry>()
    const seenSequences = new Set<number>()
    
    // Add existing logs first
    for (const log of existing) {
      logsById.set(log.id, log)
      if (log.sequence != null) seenSequences.add(log.sequence)
    }
    
    // Add/update with new logs (dedup by both id and sequence)
    let addedCount = 0
    for (const log of newLogs) {
      if (!logsById.has(log.id)) {
        // New ID — check sequence dedup
        if (log.sequence != null && seenSequences.has(log.sequence)) {
          continue // Skip duplicate by sequence
        }
        addedCount++
      }
      logsById.set(log.id, log)
      if (log.sequence != null) seenSequences.add(log.sequence)
    }
    
    // Convert back to array and sort by sequence/timestamp (ascending - oldest first)
    let combined = Array.from(logsById.values())
    combined.sort((a, b) => {
      // Prefer sequence if available (more reliable than timestamp parsing)
      if (a.sequence != null && b.sequence != null) {
        return a.sequence - b.sequence
      }
      // Fall back to timestamp comparison
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })

    console.debug(`[Logs] addLogs(${scraperId}): existing=${existing.length}, incoming=${newLogs.length}, added=${addedCount}, total=${combined.length}`)

    logsByScraperId.value.set(scraperId, combined)

    const prevOldest = minimumSequence(existing)
    const storedOldest = minimumSequence(combined)
    if (prevOldest != null && storedOldest != null && storedOldest < prevOldest) {
      lastPaginationSeq.value.delete(scraperId)
    }
  }

  /**
   * Add curated logs from gRPC stream.
   * These are UI-friendly logs selected by the scraper for display.
   * Format differs slightly from regular logs - we normalize them here.
   */
  function addCuratedLogs(scraperId: string, curatedLogs: Array<{
    timestamp: string
    level: string
    message: string
    context?: string
    workerId?: string
  }>) {
    // Convert curated log format to LogEntry format
    const normalizedLogs: LogEntry[] = curatedLogs.map((log, index) => ({
      id: `curated-${Date.now()}-${index}`,
      timestamp: log.timestamp,
      level: log.level as LogEntry['level'],
      message: log.message,
      context: log.context,
      workerId: log.workerId,
      // Mark as curated for potential UI differentiation
      curated: true
    }))
    
    addLogs(scraperId, normalizedLogs)
  }

  async function clearLogs(scraperId: string, workerId?: string) {
    try {
      if (workerId) {
        await api.clearWorkerLogs(scraperId, workerId)
        // Remove worker-specific logs from local state
        const logs = logsByScraperId.value.get(scraperId) || []
        logsByScraperId.value.set(
          scraperId,
          logs.filter(l => l.workerId !== workerId)
        )
      } else {
        await api.clearLogs(scraperId)
        // Clear local state immediately for reactive UI update
        logsByScraperId.value.set(scraperId, [])
        paginationComplete.value.delete(scraperId)
        lastPaginationSeq.value.delete(scraperId)
        // NOTE: We do NOT reset initializedScrapers here - clearing logs doesn't trigger
        // a new FETCH_LOGS on next visit. Only the first visit after registration or
        // clicking Refresh triggers FETCH_LOGS.
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to clear logs'
      return false
    }
  }

  /**
   * Clear logs locally without calling the API.
   * Used when receiving LOGS_CLEARED event from WebSocket.
   */
  function clearLogsLocally(scraperId: string) {
    logsByScraperId.value.set(scraperId, [])
    paginationComplete.value.delete(scraperId)
    lastPaginationSeq.value.delete(scraperId)
  }

  /**
   * Initialize logs for a scraper - called only on first visit to Logs tab after registration.
   * Checks with Manager if already initialized, and triggers FETCH_LOGS if not.
   */
  async function initializeLogs(scraperId: string) {
    loading.value = true
    error.value = null
    try {
      // Check if already initialized on Manager side
      const alreadyInitialized = await api.isLogsInitialized(scraperId)
      
      if (alreadyInitialized) {
        // Already initialized — mark locally.
        // Only fetch from Manager if the store is empty (first mount or after clear).
        // If store already has logs, keep them (preserves accumulated WebSocket logs + older logs).
        initializedScrapers.value.add(scraperId)
        const existing = logsByScraperId.value.get(scraperId)
        if (!existing || existing.length === 0) {
          await fetchLogs(scraperId, { limit: 500 })
        }
        return true
      }
      
      // Clear local state
      logsByScraperId.value.set(scraperId, [])
      // Tell Manager to initialize logs (triggers FETCH_LOGS command)
      await api.initializeLogs(scraperId)
      // Mark as initialized so we don't fetch again on subsequent visits
      initializedScrapers.value.add(scraperId)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialize logs'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Refresh logs - clears local state, tells Manager to clear its cache,
   * and triggers a FETCH_LOGS command to the scraper.
   * Unlike clear, this DOES trigger FETCH_LOGS.
   */
  async function refreshLogs(scraperId: string) {
    loading.value = true
    error.value = null
    try {
      // Clear local state immediately for responsive UI
      logsByScraperId.value.set(scraperId, [])
      paginationComplete.value.delete(scraperId)
      lastPaginationSeq.value.delete(scraperId)
      // Tell Manager to clear and re-fetch from scraper
      await api.refreshLogs(scraperId)
      // Make sure it's marked as initialized
      initializedScrapers.value.add(scraperId)
      // REST fallback: wait briefly for FETCH_LOGS to complete, then fetch via REST
      // in case the WebSocket LOGS push was missed or delayed
      setTimeout(async () => {
        const existing = logsByScraperId.value.get(scraperId)
        if (!existing || existing.length === 0) {
          await fetchLogs(scraperId, { limit: 500 })
        }
      }, 2000)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to refresh logs'
      return false
    } finally {
      loading.value = false
    }
  }
  
  /**
   * Fetch older logs. One page is the lines before the oldest line already shown.
   * Returns maxReached when the file is exhausted or the on-screen limit is hit.
   */
  async function fetchOlderLogs(scraperId: string): Promise<{ success: boolean; maxReached: boolean; skipped?: boolean }> {
    const currentLogs = logsByScraperId.value.get(scraperId) || []
    
    if (currentLogs.length === 0) {
      return { success: false, maxReached: false }
    }

    const beforeSeq = minimumSequence(currentLogs)
    if (beforeSeq == null) {
      console.warn('[Logs] Cannot paginate: no sequence numbers found')
      return { success: false, maxReached: false }
    }

    // That page was already requested and the oldest line did not move.
    const last = lastPaginationSeq.value.get(scraperId)
    if (last != null && last === beforeSeq) {
      return { success: false, maxReached: false, skipped: true }
    }

    // If sequence is 1 or less, there can be no older logs
    if (beforeSeq <= 1) {
      console.log(`[Logs] beforeSequence=${beforeSeq} — no older logs possible, marking complete`)
      paginationComplete.value.add(scraperId)
      return { success: false, maxReached: true }
    }

    loading.value = true
    error.value = null
    try {
      lastPaginationSeq.value.set(scraperId, beforeSeq)
      console.log(`[Logs] Requesting older logs: beforeSequence=${beforeSeq}`)
      const result = await api.fetchOlderLogs(scraperId, beforeSeq)
      
      if (result.success) {
        console.log('[Logs] Pagination request sent, waiting for logs via WebSocket...')
        return { success: true, maxReached: false }
      } else {
        // maxReached from REST = Manager already knows no more logs
        paginationComplete.value.add(scraperId)
        return { success: false, maxReached: true }
      }
    } catch (e) {
      if (lastPaginationSeq.value.get(scraperId) === beforeSeq) {
        lastPaginationSeq.value.delete(scraperId)
      }
      if (e instanceof Error && e.message.includes('429')) {
        paginationComplete.value.add(scraperId)
        return { success: false, maxReached: true }
      }
      error.value = e instanceof Error ? e.message : 'Failed to fetch older logs'
      return { success: false, maxReached: false }
    } finally {
      loading.value = false
    }
  }
  
  /**
   * Mark pagination as complete for a scraper (no more older logs).
   * Called via WebSocket when scraper signals PAGINATION_COMPLETE.
   */
  function markPaginationComplete(scraperId: string) {
    paginationComplete.value.add(scraperId)
    console.log(`[Logs] Pagination complete for ${scraperId} — no more older logs`)
  }
  
  /**
   * Reset initialization state for a scraper (called when scraper is unregistered)
   */
  function resetInitialization(scraperId: string) {
    initializedScrapers.value.delete(scraperId)
    paginationComplete.value.delete(scraperId)
    lastPaginationSeq.value.delete(scraperId)
    logsByScraperId.value.delete(scraperId)
  }

  function setFilter(level: LogLevel | null, search: string) {
    filterLevel.value = level
    filterSearch.value = search
  }

  function setSelection(scraperId: string | null, workerId: string | null = null) {
    selectedScraperId.value = scraperId
    selectedWorkerId.value = workerId
  }

  return {
    // State
    logsByScraperId,
    paginationComplete,
    loading,
    error,
    filterLevel,
    filterSearch,
    selectedScraperId,
    selectedWorkerId,
    // Getters
    getLogsForScraper,
    filteredLogs,
    isInitialized,
    // Actions
    fetchLogs,
    addLogs,
    addCuratedLogs,
    clearLogs,
    clearLogsLocally,
    initializeLogs,
    refreshLogs,
    fetchOlderLogs,
    markPaginationComplete,
    resetInitialization,
    setFilter,
    setSelection
  }
})
