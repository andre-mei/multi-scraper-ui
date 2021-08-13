import type { CommandType } from '@/types'

/** "Listing IDs" → "listing-ids": the URL segment of a data table. */
export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** One phase of a run, as the scraper reports it in `currentPhase`. */
export interface PhaseDef {
  id: string
  label: string
  title: string
  /** The command that starts a run from this phase, when the scraper offers it. */
  resumeCommand?: CommandType
}

/** The four phases every scraper runs, in order. */
export const PHASES: PhaseDef[] = [
  { id: 'PHASE_0_VALIDATE', label: 'Phase 0', title: 'Prepare/Validate' },
  { id: 'PHASE_1_SPLIT', label: 'Phase 1', title: 'Split/Partition' },
  { id: 'PHASE_2_CRAWL', label: 'Phase 2', title: 'Crawl/Paginate', resumeCommand: 'START_FROM_PHASE_2' },
  { id: 'PHASE_3_DETAILS', label: 'Phase 3', title: 'Parse Details', resumeCommand: 'START_FROM_PHASE_3' },
]

/** Phases the "More" menu offers as "Resume from …". */
export const RESUMABLE_PHASES = PHASES.filter(p => p.resumeCommand)

/** "Phase 2 · Crawl/Paginate" for a phase id; an unknown id is shown as it is. Safe in render loops. */
export function phaseText(id?: string | null): string {
  if (!id) return ''
  const p = PHASES.find(ph => ph.id === id)
  return p ? `${p.label} · ${p.title}` : id
}

/** The phase after `id`, or null after the last one (or for an unknown id). */
export function nextPhase(id?: string | null): PhaseDef | null {
  const i = PHASES.findIndex(p => p.id === id)
  return i >= 0 ? PHASES[i + 1] ?? null : null
}

/** A table of the scraper's local database, as the Data tab shows it. */
export interface DataTableDef {
  /** The SQLite table name (the `tableName` of FETCH_DATA / FETCH_RECORD). */
  key: string
  label: string
  idColumn: string
  /** The column the JSON viewer opens; absent = the table has no { } column. */
  jsonColumn?: string
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  hiddenColumns?: string[]
  columnLabels?: Record<string, string>
}

/** `routeKey` is the URL segment of a data table (the slug of its label). */
export type UiTable = DataTableDef & { routeKey: string }

const table = (t: DataTableDef): UiTable => ({ ...t, routeKey: slugify(t.label) })

/** The three tables of every scraper's local database. */
export const DATA_TABLES: UiTable[] = [
  table({ key: 'temp_splits', label: 'Splits', idColumn: 'id', jsonColumn: 'split_json' }),
  table({ key: 'temp_listing_ids', label: 'Listing IDs', idColumn: 'listing_id' }),
  table({
    key: 'temp_warehouse',
    label: 'Warehouse',
    idColumn: 'listing_id',
    jsonColumn: 'details_json',
    defaultSort: { column: 'scraping_scraped_date', direction: 'desc' },
    columnLabels: { scraping_scraped_date: 'SCRAPED_DATE' },
  }),
]

/** One field of the Configuration form. */
export interface SettingDef {
  key: string
  label: string
  type: 'INT' | 'LONG' | 'BOOL'
  min?: number
  max?: number
  help?: string
  /** Sent inside `customSettings` instead of as a top-level config field. */
  custom?: boolean
}

/** The settings every scraper has (the fields of its config). */
export const SETTINGS: SettingDef[] = [
  { key: 'maxWorkers', label: 'Max Workers', type: 'INT', min: 1, max: 100 },
  { key: 'maxRetries', label: 'Max Retries', type: 'INT', min: 0, max: 10 },
  { key: 'requestDelayMs', label: 'Request Delay (ms)', type: 'LONG', min: 0, max: 60000 },
  { key: 'timeoutMs', label: 'Timeout (ms)', type: 'LONG', min: 1000, max: 120000 },
  { key: 'useProxies', label: 'Use Proxies', type: 'BOOL' },
]

/** Shown only when the scraper reports it in `customSettings` (its site can sort newest first). */
export const NEWEST_FIRST_CRAWL: SettingDef = {
  key: 'newestFirstCrawl',
  label: 'Newest-first crawl',
  type: 'BOOL',
  custom: true,
  help: 'Phase 2 stops each split once its pages hold nothing new. Much faster, '
    + 'but deleted listings are not detected in that run.',
}

/** Titles of the log groups the scraper marks with [<KIND>_GROUP_START:<id>|…] … [<KIND>_GROUP_END:<id>]. */
const LOG_GROUP_TITLES: Record<string, string> = {
  PARSE: 'Parsing listing {id}',
}

export function logGroupTitle(kind: string): string | null {
  return LOG_GROUP_TITLES[kind] ?? null
}
