import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { SinkPagePayload, SinkStatePayload } from '@/types'

type Body = Record<string, unknown>

/** What a panel asks for when it wants a page of rows. Panels add their own fields (e.g. `type`). */
export interface SinkPageQuery {
  page: number
  size: number
  sortColumn?: string | null
  sortDir?: 'asc' | 'desc' | '' | null
  filters?: Record<string, string>
  [extra: string]: unknown
}

/** crypto.randomUUID needs a secure context; the UI may be served over plain http. */
const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const keyOf = (scraperId: string, sinkKey: string) => `${scraperId}:${sinkKey}`

function compactFilters(filters?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(filters ?? {})) {
    const value = v?.trim()
    if (value) out[k] = value
  }
  return out
}

/** Filters travel as a JSON object in a request and as JSON text in the echo; compare them in one form. */
function filtersKey(raw: unknown): string {
  let map: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try { map = raw.trim().startsWith('{') ? JSON.parse(raw) : {} } catch { map = {} }
  } else if (raw && typeof raw === 'object') {
    map = raw as Record<string, unknown>
  }
  return JSON.stringify(Object.entries(map).filter(([, v]) => String(v ?? '').trim()).sort(([a], [b]) => a.localeCompare(b)))
}

/** Does a cached page answer this query? Every field of the query must be echoed with the same value. */
function answers(page: Body, query: SinkPageQuery): boolean {
  return Object.entries(query).every(([k, v]) => {
    if (k === 'filters') return filtersKey(v) === filtersKey(page[k])
    const want = String(v ?? '').trim().toLowerCase()
    const have = String(page[k] ?? '').trim().toLowerCase()
    return want === have
  })
}

/**
 * State and pages of every sink, whatever its kind. The Manager only relays and caches them; this store keeps
 * them per scraper and sink key, and matches a page to the request that asked for it through `requestId`.
 */
export const useSinksStore = defineStore('sinks', () => {
  const states = ref<Record<string, Body>>({})
  const pages = ref<Record<string, Body>>({})
  const stateLoading = ref<Record<string, boolean>>({})
  const pageLoading = ref<Record<string, boolean>>({})
  /** The requestId of the last page we asked for; a page is applied only if it echoes it. */
  const pendingRequest: Record<string, string | undefined> = {}

  const getState = <T = Body>(scraperId: string, sinkKey: string) =>
    (states.value[keyOf(scraperId, sinkKey)] ?? null) as T | null
  const getPage = <T = Body>(scraperId: string, sinkKey: string) =>
    (pages.value[keyOf(scraperId, sinkKey)] ?? null) as T | null
  const isStateLoading = (scraperId: string, sinkKey: string) => stateLoading.value[keyOf(scraperId, sinkKey)] ?? false
  const isPageLoading = (scraperId: string, sinkKey: string) => pageLoading.value[keyOf(scraperId, sinkKey)] ?? false

  /** The state the Manager cached for this sink (what the scraper reported last). */
  async function loadState(scraperId: string, sinkKey: string) {
    try {
      const state = await api.getSinkState(scraperId, sinkKey)
      if (Object.keys(state).length) states.value[keyOf(scraperId, sinkKey)] = state
    } catch (e) {
      console.error(`Failed to load state of sink ${sinkKey}:`, e)
    }
  }

  /** Sends an operation; the answer arrives as SINK_STATE (and SINK_PAGE for PAGE). */
  async function op(scraperId: string, sinkKey: string, name: string, params?: Body) {
    const k = keyOf(scraperId, sinkKey)
    stateLoading.value[k] = true
    try {
      await api.sinkOp(scraperId, sinkKey, name, params)
    } catch (e) {
      console.error(`Sink ${sinkKey} operation ${name} failed:`, e)
      stateLoading.value[k] = false
      throw e
    }
  }

  const refresh = (scraperId: string, sinkKey: string) => op(scraperId, sinkKey, 'STATUS')

  /** Forget the rows shown so far (a new diff or a reset makes them obsolete). */
  function clearPage(scraperId: string, sinkKey: string, empty: object) {
    pages.value[keyOf(scraperId, sinkKey)] = empty as Body
  }

  /** Shows the cached page if it answers the query, otherwise asks the scraper for it. */
  async function requestPage(scraperId: string, sinkKey: string, query: SinkPageQuery) {
    const k = keyOf(scraperId, sinkKey)
    pageLoading.value[k] = true
    try {
      const cached = await api.getSinkPage(scraperId, sinkKey)
      if (cached.status !== 'PENDING' && Array.isArray(cached.rows) && answers(cached, query)) {
        pages.value[k] = cached
        pageLoading.value[k] = false
        return
      }
      const requestId = newRequestId()
      pendingRequest[k] = requestId
      const { filters, ...rest } = query
      await api.sinkOp(scraperId, sinkKey, 'PAGE', { ...rest, filters: compactFilters(filters), requestId })
    } catch (e) {
      console.error(`Failed to fetch a page of sink ${sinkKey}:`, e)
      pageLoading.value[k] = false
    }
  }

  function handleState(payload: SinkStatePayload) {
    const k = keyOf(payload.scraperId, payload.sinkKey)
    states.value[k] = payload.state
    stateLoading.value[k] = false
  }

  function handlePage(payload: SinkPagePayload) {
    const k = keyOf(payload.scraperId, payload.sinkKey)
    const page = payload.page
    if (page.status === 'PENDING') return // the scraper invalidated its cache; nothing to show
    const pending = pendingRequest[k]
    if (pending && page.requestId !== pending) return // somebody else's page
    pages.value[k] = page
    pageLoading.value[k] = false
  }

  return {
    states, pages, stateLoading, pageLoading,
    getState, getPage, isStateLoading, isPageLoading,
    loadState, op, refresh, clearPage, requestPage, handleState, handlePage,
  }
})
