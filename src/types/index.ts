// Scraper types
export type ScraperStatus = 
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'IDLE'
  | 'STARTING'
  | 'RUNNING'
  | 'PAUSED'
  | 'ERROR'
  | 'ABORTED'
  | 'VALIDATION_FAILED'
  | 'STOPPING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'

export type WorkerStatus = 
  | 'IDLE'
  | 'INITIALIZING'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ERROR'
  | 'STOPPED'

export type CommandType =
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'ABORT'
  | 'STOP'
  | 'RESTART'
  | 'UPDATE_CONFIG'
  | 'REFRESH_PROXIES'
  | 'SET_PROXY_ENABLED'
  | 'RESET_PROXY_STATS'
  | 'RESET_ALL_PROXY_STATS'
  | 'CLEAR_CACHE'
  | 'FORCE_HEALTH_REPORT'
  | 'ADVANCE_PHASE'
  | 'FETCH_LOGS'
  | 'FETCH_DATA'
  | 'START_FROM_PHASE_2'
  | 'START_FROM_PHASE_3'
  | 'FETCH_RECORD'

export type CommandStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

// Metrics
export interface ScraperMetrics {
  totalItems: number
  processedItems: number
  successfulItems: number
  failedItems: number
  overallProgress: number
  itemsPerSecond: number
  totalBytesDownloaded: number
  totalRequests: number
  failedRequests: number
  uptimeSeconds: number
  estimatedCompletion?: string
}

export interface WorkerMetrics {
  totalItems: number
  processedItems: number
  successfulItems: number
  failedItems: number
  skippedItems: number
  progressPercent: number
  successRate: number
  itemsPerSecond: number
  averageProcessingTimeMs: number
  bytesDownloaded: number
  requestsMade: number
  requestsFailed: number
  retryCount: number
  consecutiveErrors: number
  startTime?: string
  lastActivityTime?: string
  estimatedCompletionSeconds?: number
}

// Scraper Event (from gRPC status stream)
export interface ScraperEvent {
  type: string
  severity: string
  message: string
  metadata?: Record<string, string>
  timestamp: string
}

// Test Status (from gRPC test service)
export interface TestStatus {
  running: boolean
  testId?: string
  testType?: string
  progress?: number
  currentStep?: string
  correlationId?: string
  success?: boolean
  summary?: string
  errors?: string[]
  completedAt?: string
}

// gRPC Connection State
export interface GrpcState {
  state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
  details: string
  updatedAt: string
}

// Proxy Statistics (aggregated)
export interface ProxyStats {
  totalProxies: number
  availableProxies: number
  inUseProxies: number
  proxyTotalRequests: number
  proxySuccessfulRequests: number
  proxyFailedRequests: number
  proxyTotalBytesDownloaded: number
  proxyAverageResponseTimeMs: number
}

// Individual Proxy Detail
export interface ProxyDetail {
  proxyId: string
  provider: string
  tier: string
  proxyIp: string
  login?: string
  country?: string
  enabled: boolean
  inUse: boolean
  currentWorkerId?: string
  // Statistics
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  blockedRequests: number
  timeoutRequests: number
  successRate: number
  avgResponseTimeMs: number
  minResponseTimeMs: number
  maxResponseTimeMs: number
  bytesDownloaded: number
  consecutiveFailures: number
  selectionScore: number
  // Timestamps
  firstSeen?: string
  lastUsed?: string
  lastSuccess?: string
  lastFailure?: string
  lastUpdated?: string
}

// Scraper
export interface Scraper {
  scraperId: string
  name: string
  type: string
  version: string
  scrapingMode?: string
  host: string
  port: number
  status: ScraperStatus
  /** The phase the scraper is in, e.g. PHASE_2_CRAWL (see usePhases). */
  currentPhase?: string
  workerCount: number
  activeWorkerCount: number
  idleWorkerCount: number
  errorWorkerCount: number
  workers?: Worker[]
  metrics?: ScraperMetrics
  /** The scraper's current settings, as it reported them. */
  config?: ScraperConfig | null
  proxyStats?: ProxyStats
  proxyDetails?: ProxyDetail[]
  registeredAt?: string
  lastHeartbeat?: string
  lastHealthReport?: string
  startedAt?: string
  tags?: string[]
  isConnected: boolean
  // NEW: gRPC-based properties
  events?: ScraperEvent[]
  lastEventAt?: string
  testStatus?: TestStatus
  grpcState?: GrpcState
  // Server-persisted status history
  statusHistory?: StatusHistoryEntry[]
}

/** The settings of a scraper (GET/PUT /scrapers/{id}/config). */
export interface ScraperConfig {
  targetUrl?: string
  targetUrls?: string[]
  maxWorkers: number
  maxRetries: number
  requestDelayMs: number
  timeoutMs: number
  useProxies: boolean
  proxyCount?: number
  /** Switches only some scrapers have, e.g. newestFirstCrawl. */
  customSettings?: Record<string, unknown> | null
}

export interface StatusHistoryEntry {
  status: string
  message: string
  timestamp: string
}

// Worker
export interface Worker {
  workerId: string
  scraperId: string
  name: string
  proxyIp?: string
  proxyPort?: number
  proxyProtocol?: string
  status: WorkerStatus
  statusMessage?: string
  currentTask?: string
  currentPhase?: string
  currentUrl?: string
  metrics?: WorkerMetrics
  startedAt?: string
  lastHeartbeat?: string
  lastActivityAt?: string
  lastError?: string
  lastErrorAt?: string
  /** SCP-16: Anti-bot detection count (not HTTP errors) */
  detectionCount: number
}

// Command
export interface Command {
  commandId: string
  type: CommandType
  scraperId: string
  workerId?: string
  parameters?: Record<string, unknown>
  createdAt: string
  acknowledgedAt?: string
  completedAt?: string
  status: CommandStatus
  errorMessage?: string
}

// Log Entry
export type LogScope = 'MAIN' | 'WORKER' | 'BOTH'

export interface LogEntry {
  id: string
  scraperId?: string
  workerId?: string
  level: LogLevel
  message: string
  logger?: string
  thread?: string
  timestamp: string
  stackTrace?: string
  context?: string
  // Sequence number from scraper (monotonically increasing, used for ordering)
  sequence?: number
  // UI routing stamped by scraper; missing = treat as BOTH (legacy)
  scope?: LogScope
  // NEW: Mark logs from gRPC curated stream
  curated?: boolean
}

// API Responses
export interface CommandResponse {
  success: boolean
  message: string
  commandIds?: string[]
  timestamp: string
}

export interface DataResponse {
  tableName: string
  records: Record<string, unknown>[]
  totalCount: number
  bufferSize: number
}

export interface DataUpdatePayload {
  scraperId: string
  tableName: string
  records: Record<string, unknown>[]
  totalCount: number
  bufferSize: number
  timestamp: string
}

/** Answer to FETCH_RECORD: one record's JSON column. */
export interface RecordJsonPayload {
  scraperId: string
  tableName: string
  recordId: string
  json?: string | null
  error?: string | null
}

export interface ManagerStatus {
  scraperCount: number
  connectedScrapers: number
  runningScrapers: number
  totalWorkers: number
  activeWorkers: number
  websocketClients: number
  serverTime: string
}

// WebSocket Messages
export type WSMessageType =
  | 'CONNECTED'
  | 'SCRAPER_REGISTERED'
  | 'SCRAPER_STATUS_CHANGE'
  | 'HEALTH_UPDATE'
  | 'LOGS'
  | 'LOGS_CLEARED'
  | 'COMMANDS_QUEUED'
  | 'COMMANDS_DELIVERED'
  | 'COMMAND_ACKNOWLEDGED'
  | 'CONFIG_UPDATE'
  | 'SCRAPER_REMOVED'
  | 'PONG'
  // NEW: gRPC-based message types
  | 'SCRAPER_EVENT'
  | 'CURATED_LOGS'
  | 'TEST_STARTED'
  | 'TEST_PROGRESS'
  | 'TEST_COMPLETED'
  | 'GRPC_CONNECTION_STATE'
  | 'PAGINATION_COMPLETE'
  | 'DATA_UPDATE'
  | 'RECORD_JSON'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
}

export interface WSScraperStatusPayload {
  scraperId: string
  status: ScraperStatus
  currentPhase: string
  statusHistory: StatusHistoryEntry[]
  timestamp: string
}

export interface WSHealthUpdatePayload {
  scraperId: string
  scraper: Scraper
  timestamp: string
}

export interface WSLogsPayload {
  scraperId: string
  logs: LogEntry[]
  timestamp: string
}

export interface WSCommandsPayload {
  commands: Command[]
  timestamp: string
}
