// Types of the CENTRAL_DB sink panel: the shape of its SINK_STATE and SINK_PAGE bodies.
// They belong to this one sink kind, so they live next to its panel, not in the shared types.

export interface CentralDbProgress {
  operation: string
  step: string
  processed: number
  total: number
  message: string
  startedAt?: string | null
  finishedAt?: string | null
  error?: string | null
}

export interface CentralDbDiffSummary {
  tableName: string
  newCount: number
  modifiedCount: number
  deletedCount: number
  unchangedCount: number
  localTotal: number
  remoteTotal: number
  startedAt?: string | null
  finishedAt?: string | null
  resultMessage?: string | null
}

export interface CentralDbValidationCheck {
  id: string
  severity: string
  message: string
  value?: unknown
}

export interface CentralDbValidation {
  tableName: string
  blocked: boolean
  requiresConfirmation: boolean
  confirmationToken?: string | null
  checks: CentralDbValidationCheck[]
}

export interface CentralDbSyncResult {
  inserted: number
  updated: number
  markedDeleted: number
  success: boolean
  error?: string | null
  finishedAt?: string | null
}

export interface CentralDbStatus {
  enabled?: boolean
  available?: boolean
  apiBaseUrl?: string
  /** Which consumer, dataset and source the sink pushes to. */
  consumer?: string
  dataset?: string
  source?: string
  /** Where the consumer keeps the records, as it reported it. */
  tableName?: string
  tableExists?: boolean
  localCount?: number
  remoteCount?: number
  jobRunning?: boolean
  progress?: CentralDbProgress | null
  lastDiff?: CentralDbDiffSummary | null
  /** When the last Diff compared every hash (not just fingerprints); null until the first one. */
  lastFullCompareAt?: string | null
  /** The last Diff ended on matching fingerprints, without downloading the hashes. */
  lastDiffFast?: boolean
  lastValidation?: CentralDbValidation | null
  lastSync?: CentralDbSyncResult | null
  rejection?: string | null
  rejectionMessage?: string | null
}

/** One classified diff row. Columns come from the sink; `diff_type` is part of the sink-kind contract. */
export type CentralDbDiffRow = Record<string, unknown> & { diff_type: string }

export interface CentralDbDiffPageQuery {
  type: string
  page: number
  size: number
  sortColumn?: string | null
  sortDir?: 'asc' | 'desc' | '' | null
  filters?: Record<string, string>
}

export interface CentralDbDiffPage {
  scraperId?: string
  requestId?: string
  type: string
  page: number
  size: number
  total: number
  sortColumn?: string
  sortDir?: string
  filters?: Record<string, string> | string
  rows: CentralDbDiffRow[]
  status?: string
  timestamp?: string
}
