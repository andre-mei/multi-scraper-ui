import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { FlavorTable, Scraper } from '@/types'

/** Highest descriptor schemaVersion this UI understands. A higher one is shown raw, never guessed at. */
export const SUPPORTED_FLAVOR_SCHEMA = 2

/** "Listing IDs" → "listing-ids". Only used to open old links that were built from a table label. */
export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** `routeKey` is the URL segment of a data table (its stable key); `slug` is the legacy label-based form. */
export type UiTable = FlavorTable & { routeKey: string; slug: string }

/** Text for a stage id: "label · title" when the scraper declares it, else the raw id. Plain function, safe in render loops. */
export function stageTextFor(scraper: Scraper | null | undefined, id?: string | null): string {
  if (!id) return ''
  const s = scraper?.flavor?.stages.find(st => st.id === id)
  return !s ? id : s.title ? `${s.label} · ${s.title}` : s.label
}

/** Everything the UI knows about a scraper's flavor comes through here; no descriptor → empty lists, raw ids. */
export function useFlavor(scraper: MaybeRefOrGetter<Scraper | null | undefined>) {
  const flavor = computed(() => toValue(scraper)?.flavor ?? null)
  // A newer schema than we understand: expose nothing flavor-driven, the view shows the raw JSON instead.
  const supported = computed(() => !flavor.value || flavor.value.schemaVersion <= SUPPORTED_FLAVOR_SCHEMA)
  const stages = computed(() => (supported.value ? flavor.value?.stages : null) ?? [])

  // Absent capabilities (or no descriptor at all) count as true, so old scrapers keep their tabs.
  const hasWorkers = computed(() => flavor.value?.capabilities?.workers ?? true)
  const hasProxies = computed(() => flavor.value?.capabilities?.proxies ?? true)
  const problems = computed(() => toValue(scraper)?.flavorProblems ?? [])

  const stageText = (id?: string | null) => stageTextFor(toValue(scraper), id)
  const nextStage = (id?: string | null) => {
    const i = stages.value.findIndex(s => s.id === id)
    return i >= 0 ? stages.value[i + 1] ?? null : null
  }
  const resumableStages = computed(() => stages.value.filter(s => s.resumable))

  const tables = computed<UiTable[]>(() =>
    (supported.value ? flavor.value?.tables ?? [] : []).map(t => ({ ...t, routeKey: t.key, slug: slugify(t.label) })))
  const findTable = (key?: string | null) => tables.value.find(t => t.key === key) ?? null
  const actions = computed(() => (supported.value ? flavor.value?.actions : null) ?? [])
  const settings = computed(() => (supported.value ? flavor.value?.settings : null) ?? [])
  const logGroupTitle = (kind: string) => flavor.value?.logGroups?.find(g => g.kind === kind)?.title ?? null

  return {
    flavor, supported, hasWorkers, hasProxies, problems,
    stages, stageText, nextStage, resumableStages, tables, findTable, actions, settings, logGroupTitle,
  }
}
