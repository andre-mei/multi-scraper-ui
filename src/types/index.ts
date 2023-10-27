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
  | 'START_FROM_STAGE'
  | 'PAUSE'
  | 'RESUME'
  | 'PAUSE_WORKER'
  | 'RESUME_WORKER'
  | 'ABORT'
  | 'STOP'
  | 'RESTART'
  | 'UPDATE_CONFIG'
  | 'REFRESH_PROXIES'
  | 'SET_PROXY_ENABLED'
  | 'RESET_PROXY_STATS'
  | 'RESET_ALL_PROXY_STATS'
  | 'FORCE_HEALTH_REPORT'
  | 'ADVANCE_STAGE'
  | 'RESET_METRICS'
  | 'FETCH_DATA'
  | 'FETCH_RECORD'
  | 'START_FROM_STAGE'
  | 'SINK'
  | 'ACTION'

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
  /** Stage id this event belongs to (from the status history); rendered as "label · title · message". */
  stage?: string | null
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
  currentStage?: string
  flavor?: FlavorDescriptor | null
  /** Problems the Manager found in the descriptor (FlavorDescriptor.problems()); never blocking. */
  flavorProblems?: string[]
  workerCount: number
  activeWorkerCount: number
  idleWorkerCount: number
  errorWorkerCount: number
  workers?: Worker[]
  metrics?: ScraperMetrics
  /** Current value of each setting the flavor declares (`flavor.settings`), by key. */
  settingsValues?: Record<string, unknown> | null
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

export interface StatusHistoryEntry {
  status: string
  /** Stage id this entry belongs to (absent on old persisted entries). */
  stage?: string | null
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
  currentStage?: string
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

/** SINK_STATE: the scraper's current state of one sink (opaque to the shell; each panel types its own). */
export interface SinkStatePayload {
  scraperId: string
  sinkKey: string
  state: Record<string, unknown>
  timestamp?: string
}

/** SINK_PAGE: one page of a sink's rows; the body echoes the request's parameters, including `requestId`. */
export interface SinkPagePayload {
  scraperId: string
  sinkKey: string
  page: Record<string, unknown>
  timestamp?: string
}

// Flavor descriptor (sent by the scraper on registration, forwarded by the Manager unchanged)
export interface FlavorStage { id: string; label: string; title?: string; resumable?: boolean }
export interface FlavorSort { column: string; direction: 'asc' | 'desc' }
export interface FlavorTable {
  key: string
  label: string
  idColumn: string
  jsonColumn?: string
  defaultSort?: FlavorSort
  hiddenColumns?: string[]
  columnLabels?: Record<string, string>
  /** Optional ordered columns; when present they come first, in this order. */
  columns?: FlavorColumn[]
}
export interface FlavorColumn { key: string; label: string }
/** A button of a RECORDS sink; `scope` says which rows the operation applies to. */
export interface FlavorSinkOperation { op: string; label: string; scope: 'NONE' | 'SELECTED' | 'ALL'; confirm?: string }
export interface FlavorSink {
  kind: string
  key: string
  label: string
  table: string
  columns: FlavorColumn[]
  operations?: FlavorSinkOperation[]
}
/** A flavor-level one-shot command in the "More" menu; sent as ACTION{actionId}. */
export interface FlavorAction { id: string; label: string; confirm?: string }
/** One field of the Configuration form. Absent min/max/unit/help mean none. */
export interface FlavorSetting {
  key: string
  label: string
  type: 'INT' | 'LONG' | 'BOOL' | 'STRING' | 'STRING_LIST'
  min?: number | null
  max?: number | null
  unit?: string | null
  help?: string | null
}
export interface FlavorLogGroup { kind: string; title?: string }
/** Absent = true: a descriptor without capabilities keeps the Workers and Proxies tabs. */
export interface FlavorCapabilities { workers?: boolean; proxies?: boolean }
export interface FlavorDescriptor {
  schemaVersion: number
  id: string
  label: string
  capabilities?: FlavorCapabilities | null
  stages: FlavorStage[]
  tables: FlavorTable[]
  sinks?: FlavorSink[]
  actions?: FlavorAction[]
  settings?: FlavorSetting[]
  logGroups?: FlavorLogGroup[]
}

/** Answer to FETCH_RECORD: one record's JSON column. */
export interface RecordJsonPayload {
  scraperId: string
  tableKey: string
  recordId: string
  source?: string | null
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
  | 'SINK_STATE'
  | 'SINK_PAGE'
  | 'RECORD_JSON'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
}

export interface WSScraperStatusPayload {
  scraperId: string
  status: ScraperStatus
  currentStage: string
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
