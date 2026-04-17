import { detectState, extractDates } from './extract.js';
import { dedupeEdges, extractEdges, filterToScope } from './deps.js';
import { cleanTitle } from './titleClean.js';
import type { GanttRow, RoamBlockPull, TagScope, TasksResponse } from '../types.js';

function matchedTags(block: RoamBlockPull, scope: TagScope): string[] {
  const titles = (block[':block/refs'] ?? [])
    .map((r) => r[':node/title'])
    .filter((t): t is string => !!t);
  const tagSet = new Set(scope.tags);
  const prefix = scope.prefix ?? '';
  const matches: string[] = [];
  for (const title of titles) {
    if (tagSet.has(title) || (prefix && title.startsWith(prefix))) {
      if (!matches.includes(title)) matches.push(title);
    }
  }
  return matches;
}

function pickPrimary(tags: string[], scope: TagScope): string {
  // priority: first tag in scope.tags that matches, then first prefix match
  for (const exact of scope.tags) {
    if (tags.includes(exact)) return exact;
  }
  const prefix = scope.prefix ?? '';
  if (prefix) {
    for (const t of tags) if (t.startsWith(prefix)) return t;
  }
  return tags[0] ?? '';
}

export function shapeBlocks(
  blocks: RoamBlockPull[],
  scope: TagScope,
): TasksResponse {
  const rows: GanttRow[] = [];
  const unscheduled: GanttRow[] = [];
  const rawEdges = blocks.flatMap(extractEdges);

  for (const block of blocks) {
    const tags = matchedTags(block, scope);
    if (tags.length === 0) continue; // shouldn't happen — query filtered by tag refs
    const state = detectState(block);
    if (scope.onlyTodos && state === null) continue;
    if (!scope.includeDone && state === 'DONE') continue;

    const { start, end, source } = extractDates(block);
    const row: GanttRow = {
      id: block[':block/uid'],
      title: cleanTitle(block[':block/string'], tags),
      start,
      end,
      state,
      tags,
      primaryTag: pickPrimary(tags, scope),
      page: block[':block/page']?.[':node/title'] ?? '',
      parentUid: block[':block/parents']?.slice(-1)[0]?.[':block/uid'] ?? null,
      source,
      dependsOn: [],
    };

    if (source === 'none') unscheduled.push(row);
    else rows.push(row);
  }

  const keptIds = new Set<string>([...rows, ...unscheduled].map((r) => r.id));
  const edges = filterToScope(dedupeEdges(rawEdges), keptIds);
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.to) ?? [];
    if (!list.includes(e.from)) list.push(e.from);
    incoming.set(e.to, list);
  }
  for (const r of rows) r.dependsOn = incoming.get(r.id) ?? [];
  for (const r of unscheduled) r.dependsOn = incoming.get(r.id) ?? [];

  rows.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  unscheduled.sort((a, b) => a.title.localeCompare(b.title));

  return { rows, unscheduled };
}
