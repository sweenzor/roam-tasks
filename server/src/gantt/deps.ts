import type { DepEdge, RoamBlockPull } from '../types.js';

const DEP_ATTR = /^(blocks|blocked-by)::/i;
const BLOCK_REF = /\(\(([A-Za-z0-9_-]+)\)\)/g;

function targetUids(child: {
  ':block/string': string;
  ':block/refs'?: { ':node/title'?: string; ':block/uid'?: string }[];
}): string[] {
  const out = new Set<string>();
  for (const r of child[':block/refs'] ?? []) {
    // Block-to-block refs have a :block/uid and no :node/title.
    // Page refs (e.g. TODO, a date) carry a :node/title; skip those.
    if (r[':block/uid'] && !r[':node/title']) out.add(r[':block/uid']);
  }
  // Fallback for fixtures or pulls missing :block/uid on refs: scrape ((uid)) from the string.
  for (const match of child[':block/string'].matchAll(BLOCK_REF)) {
    out.add(match[1]);
  }
  return [...out];
}

export function extractEdges(block: RoamBlockPull): DepEdge[] {
  const self = block[':block/uid'];
  const edges: DepEdge[] = [];
  for (const child of block[':block/children'] ?? []) {
    const m = DEP_ATTR.exec(child[':block/string']);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    for (const target of targetUids(child)) {
      if (target === self) continue; // self-loops are garbage
      if (kind === 'blocks') edges.push({ from: self, to: target });
      else edges.push({ from: target, to: self });
    }
  }
  return edges;
}

export function dedupeEdges(edges: DepEdge[]): DepEdge[] {
  const seen = new Set<string>();
  const out: DepEdge[] = [];
  for (const e of edges) {
    const k = `${e.from}→${e.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export function filterToScope(edges: DepEdge[], inScope: Set<string>): DepEdge[] {
  return edges.filter((e) => inScope.has(e.from) && inScope.has(e.to));
}
