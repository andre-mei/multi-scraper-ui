import type {
  Scraper,
  Worker,
  Command,
  LogEntry,
  CommandType,
  CommandResponse,
  ManagerStatus,
  DataResponse,
  ProxyDetail,
  ScraperConfig
} from '@/types'

const API_BASE = '/api/ui'

class ApiService {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      ...options
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Scrapers
  async getScrapers(): Promise<Scraper[]> {
    return this.request<Scraper[]>('/scrapers')
  }

  async getScraper(scraperId: string): Promise<Scraper> {
    return this.request<Scraper>(`/scrapers/${scraperId}`)
  }

  async removeScraper(scraperId: string): Promise<void> {
    await this.request(`/scrapers/${scraperId}`, { method: 'DELETE' })
  }

  // Workers
  async getWorkers(scraperId: string): Promise<Worker[]> {
    return this.request<Worker[]>(`/scrapers/${scraperId}/workers`)
  }

  async getWorker(scraperId: string, workerId: string): Promise<Worker> {
    return this.request<Worker>(`/scrapers/${scraperId}/workers/${workerId}`)
  }

  // Proxies
  async getProxies(scraperId: string): Promise<ProxyDetail[]> {
    return this.request<ProxyDetail[]>(`/scrapers/${scraperId}/proxies`)
  }

  // Commands
  async sendCommand(
    scraperId: string,
    type: CommandType,
    workerId?: string,
    workerIds?: string[],
    parameters?: Record<string, unknown>
  ): Promise<CommandResponse> {
    return this.request<CommandResponse>('/commands', {
      method: 'POST',
      body: JSON.stringify({
        scraperId,
        type,
        workerId,
        workerIds,
        parameters
      })
    })
  }

  async getCommandHistory(scraperId: string, limit = 50): Promise<Command[]> {
    return this.request<Command[]>(`/scrapers/${scraperId}/commands?limit=${limit}`)
  }

  async getCommand(commandId: string): Promise<Command> {
    return this.request<Command>(`/commands/${commandId}`)
  }

  // Logs
  async getLogs(
    scraperId: string,
    options?: {
      offset?: number
      limit?: number
      level?: string
      search?: string
    }
  ): Promise<LogEntry[]> {
    const params = new URLSearchParams()
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.level) params.set('level', options.level)
    if (options?.search) params.set('search', options.search)

    return this.request<LogEntry[]>(`/scrapers/${scraperId}/logs?${params}`)
  }

  async getWorkerLogs(
    scraperId: string,
    workerId: string,
    options?: {
      offset?: number
      limit?: number
      level?: string
      search?: string
    }
  ): Promise<LogEntry[]> {
    const params = new URLSearchParams()
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.level) params.set('level', options.level)
    if (options?.search) params.set('search', options.search)

    return this.request<LogEntry[]>(
      `/scrapers/${scraperId}/workers/${workerId}/logs?${params}`
    )
  }

  async getLogsSince(scraperId: string, since: string, limit = 100): Promise<LogEntry[]> {
    return this.request<LogEntry[]>(
      `/scrapers/${scraperId}/logs/since?since=${encodeURIComponent(since)}&limit=${limit}`
    )
  }

  async clearLogs(scraperId: string): Promise<void> {
    await this.request(`/scrapers/${scraperId}/logs`, { method: 'DELETE' })
  }

  async refreshLogs(scraperId: string): Promise<void> {
    await this.request(`/scrapers/${scraperId}/logs/refresh`, { method: 'POST' })
  }
  
  /**
   * Fetch older logs with pagination — loads logs before a specific sequence.
   * Returns success/maxReached status; actual logs arrive via WebSocket.
   */
  async fetchOlderLogs(scraperId: string, beforeSequence: number): Promise<{ success: boolean; maxReached: boolean }> {
    return this.request<{ success: boolean; maxReached: boolean }>(
      `/scrapers/${scraperId}/logs/older?beforeSequence=${beforeSequence}`, 
      { method: 'POST' }
    )
  }
  
  /**
   * Initialize logs for a scraper - triggers FETCH_LOGS for the first time.
   * Should only be called on first visit to Logs tab after scraper registration.
   */
  async initializeLogs(scraperId: string): Promise<void> {
    await this.request(`/scrapers/${scraperId}/logs/initialize`, { method: 'POST' })
  }
  
  /**
   * Check if logs have been initialized for a scraper.
   * Returns true if FETCH_LOGS has been called at least once since registration.
   */
  async isLogsInitialized(scraperId: string): Promise<boolean> {
    const result = await this.request<{ initialized: boolean }>(`/scrapers/${scraperId}/logs/initialized`)
    return result.initialized
  }

  async clearWorkerLogs(scraperId: string, workerId: string): Promise<void> {
    await this.request(`/scrapers/${scraperId}/workers/${workerId}/logs`, {
      method: 'DELETE'
    })
  }

  // Config
  /** The scraper's current settings. */
  async getConfig(scraperId: string): Promise<ScraperConfig | null> {
    try {
      return await this.request<ScraperConfig>(`/scrapers/${scraperId}/config`)
    } catch (e) {
      console.warn('Failed to fetch config:', e)
      return null
    }
  }

  /** Sends the changed settings only (switches such as newestFirstCrawl inside `customSettings`). */
  async updateConfig(scraperId: string, config: Partial<ScraperConfig>): Promise<CommandResponse> {
    return this.request<CommandResponse>(`/scrapers/${scraperId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config)
    })
  }

  // Status
  async getManagerStatus(): Promise<ManagerStatus> {
    return this.request<ManagerStatus>('/status')
  }

  // Data
  async getScraperData(scraperId: string, tableName: string): Promise<DataResponse> {
    return this.request<DataResponse>(`/scrapers/${scraperId}/data/${tableName}`)
  }

  async fetchScraperData(scraperId: string, tableName: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/scrapers/${scraperId}/data/${tableName}/fetch`, {
      method: 'POST'
    })
  }

  /** Ask the scraper for one record's JSON; the answer arrives as a RECORD_JSON WebSocket message. */
  async fetchRecord(scraperId: string, tableName: string, recordId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(
      `/scrapers/${scraperId}/data/${encodeURIComponent(tableName)}/record`,
      { method: 'POST', body: JSON.stringify({ recordId }) }
    )
  }

  async clearScraperData(scraperId: string, tableName: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/scrapers/${scraperId}/data/${tableName}`, {
      method: 'DELETE'
    })
  }

  // UI Preferences
  async getPreference<T = unknown>(key: string): Promise<T | null> {
    try {
      return await this.request<T>(`/preferences/${key}`)
    } catch {
      return null
    }
  }

  async savePreference(key: string, value: unknown): Promise<void> {
    await this.request(`/preferences/${key}`, {
      method: 'PUT',
      body: JSON.stringify(value)
    })
  }
}

export const api = new ApiService()
