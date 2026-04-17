import { parseDate } from './parseDate.js';
import type { DateSource, RoamBlockPull } from '../types.js';

export type ExtractedDates = {
  start: string | null;
  end: string | null;
  source: DateSource;
};

const ATTR = /^(start|due|end)::/i;

function datesFromRefs(refs: { ':node/title'?: string }[] | undefined): string[] {
  if (!refs) return [];
  const out: string[] = [];
  for (const r of refs) {
    const iso = parseDate(r[':node/title']);
    if (iso) out.push(iso);
  }
  return out;
}

function firstDateFromAttrChild(child: {
  ':block/string': string;
  ':block/refs'?: { ':node/title'?: string }[];
}): string | null {
  const fromRef = datesFromRefs(child[':block/refs'])[0];
  if (fromRef) return fromRef;
  // fallback: parse date text out of the attribute body itself
  const body = child[':block/string'].replace(ATTR, '').trim();
  return parseDate(body);
}

export function extractDates(block: RoamBlockPull): ExtractedDates {
  // 1. attrs
  const attrs: Record<'start' | 'due' | 'end', string | null> = {
    start: null, due: null, end: null,
  };
  for (const child of block[':block/children'] ?? []) {
    const m = ATTR.exec(child[':block/string']);
    if (!m) continue;
    const key = m[1].toLowerCase() as 'start' | 'due' | 'end';
    if (attrs[key]) continue;
    attrs[key] = firstDateFromAttrChild(child);
  }
  if (attrs.start || attrs.due || attrs.end) {
    const start = attrs.start ?? attrs.due ?? attrs.end;
    const end = attrs.end ?? attrs.due ?? attrs.start;
    return { start, end, source: 'attrs' };
  }

  // 2. inline [[date]] refs in the block itself
  const inline = datesFromRefs(block[':block/refs']);
  if (inline.length === 1) {
    return { start: inline[0], end: inline[0], source: 'inline' };
  }
  if (inline.length >= 2) {
    const sorted = [...inline].sort();
    return { start: sorted[0], end: sorted[sorted.length - 1], source: 'inline' };
  }

  // 3. daily-note page
  const pageDate = parseDate(block[':block/page']?.[':node/title']);
  if (pageDate) {
    return { start: pageDate, end: pageDate, source: 'daily-note' };
  }

  // 4. none
  return { start: null, end: null, source: 'none' };
}

export function detectState(block: RoamBlockPull): 'TODO' | 'DONE' | null {
  const refs = block[':block/refs'] ?? [];
  for (const r of refs) {
    if (r[':node/title'] === 'DONE') return 'DONE';
  }
  for (const r of refs) {
    if (r[':node/title'] === 'TODO') return 'TODO';
  }
  // fallback: inspect the string marker
  if (block[':block/string'].includes('{{[[DONE]]}}')) return 'DONE';
  if (block[':block/string'].includes('{{[[TODO]]}}')) return 'TODO';
  return null;
}
