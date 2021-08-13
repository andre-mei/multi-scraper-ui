import type { LogEntry } from "@/types";

/**
 * Log group detection. Scrapers bracket related lines with markers of one generic pattern:
 *
 *   [<KIND>_GROUP_START:<id>|<detail>]   e.g. [PARSE_GROUP_START:12345|https://example.com/12345]
 *   [<KIND>_GROUP_END:<id>]              (anything after a '|' in the END marker is ignored)
 *
 * `detail` is the group's URL when it starts with http(s)://, otherwise its title text.
 */
const START_RE = /^\[([A-Z0-9_]+)_GROUP_START:([^|\]]+)(?:\|(.*))?\]$/;
const END_RE = /^\[([A-Z0-9_]+)_GROUP_END:([^|\]]+)(?:\|.*)?\]$/;

export interface LogGroup {
  type: "group";
  kind: string;
  id: string;
  /** Unique per kind and id: used to remember which groups are expanded. */
  key: string;
  url: string;
  title: string;
  logs: LogEntry[];
  timestamp: string;
  workerId?: string;
  hasWarns: boolean;
  hasErrors: boolean;
}

export interface SingleLog {
  type: "single";
  log: LogEntry;
}

export type DisplayEntry = LogGroup | SingleLog;

interface OpenGroup {
  kind: string;
  id: string;
  url: string;
  title: string;
  logs: LogEntry[];
}

function titleOf(kind: string, id: string, detail: string, template: string | null): string {
  if (template) return template.replace("{id}", id).replace("{detail}", detail);
  return !isUrl(detail) && detail ? detail : `${kind} ${id}`;
}

const isUrl = (s: string) => /^https?:\/\//.test(s);

/**
 * Groups logs between START and END markers into collapsible entries.
 * Takes logs oldest-first and returns entries oldest-first. A plain line joins the most recently
 * opened group on its (non-empty) thread; groups that never close are flushed as single lines.
 */
export function groupLogs(
  oldestFirst: LogEntry[],
  titleTemplate: (kind: string) => string | null,
): DisplayEntry[] {
  const result: DisplayEntry[] = [];
  const open = new Map<string, OpenGroup>();
  const openByThread = new Map<string, string[]>(); // thread → keys, most recent last

  const forget = (key: string, thread: string) => {
    open.delete(key);
    const stack = openByThread.get(thread);
    if (stack) openByThread.set(thread, stack.filter((k) => k !== key));
  };

  for (const entry of oldestFirst) {
    const start = entry.message.match(START_RE);
    if (start) {
      const [, kind, id, detail = ""] = start;
      const key = `${kind}:${entry.thread || id}`;
      open.set(key, {
        kind,
        id,
        url: isUrl(detail) ? detail : "",
        title: titleOf(kind, id, detail, titleTemplate(kind)),
        logs: [],
      });
      if (entry.thread) {
        const stack = (openByThread.get(entry.thread) ?? []).filter((k) => k !== key);
        openByThread.set(entry.thread, [...stack, key]);
      }
      continue;
    }

    const end = entry.message.match(END_RE);
    if (end) {
      const key = `${end[1]}:${entry.thread || end[2]}`;
      const group = open.get(key);
      if (group) {
        forget(key, entry.thread ?? "");
        result.push({
          type: "group",
          kind: group.kind,
          id: group.id,
          key: `${group.kind}:${group.id}`,
          url: group.url,
          title: group.title,
          logs: group.logs,
          timestamp: group.logs.length > 0 ? group.logs[0].timestamp : entry.timestamp,
          workerId: entry.workerId,
          hasWarns: group.logs.some((l) => l.level === "WARN"),
          hasErrors: group.logs.some((l) => l.level === "ERROR" || l.level === "FATAL"),
        });
      }
      continue;
    }

    const stack = entry.thread ? openByThread.get(entry.thread) : undefined;
    const group = stack?.length ? open.get(stack[stack.length - 1]) : undefined;
    if (group) group.logs.push(entry);
    else result.push({ type: "single", log: entry });
  }

  for (const group of open.values()) {
    for (const log of group.logs) result.push({ type: "single", log });
  }
  return result;
}
