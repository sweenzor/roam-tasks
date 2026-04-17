import { readFile } from 'node:fs/promises';
import type { RoamBlockPull, TagScope } from '../types.js';

type FixtureGraph = {
  pages: { ':node/title': string; ':block/uid': string }[];
  blocks: RoamBlockPull[];
};

let cached: FixtureGraph | null = null;
let cachedPath = '';

async function load(path: string): Promise<FixtureGraph> {
  if (cached && cachedPath === path) return cached;
  const raw = await readFile(path, 'utf8');
  cached = JSON.parse(raw);
  cachedPath = path;
  return cached!;
}

export async function fixtureFetchBlocks(
  path: string,
  scope: TagScope,
): Promise<RoamBlockPull[]> {
  const { pages, blocks } = await load(path);
  const tagTitles = new Set(scope.tags);
  const prefix = scope.prefix ?? '';
  const matchingTagTitles = new Set(
    pages
      .map((p) => p[':node/title'])
      .filter((t) => tagTitles.has(t) || (prefix && t.startsWith(prefix))),
  );
  if (matchingTagTitles.size === 0) return [];
  return blocks.filter((b) =>
    (b[':block/refs'] ?? []).some((r) =>
      r[':node/title'] ? matchingTagTitles.has(r[':node/title']) : false,
    ),
  );
}

export async function fixtureRewriteBlockString(
  path: string,
  uid: string,
  nextString: string,
): Promise<RoamBlockPull | null> {
  const graph = await load(path);
  const block = graph.blocks.find((b) => b[':block/uid'] === uid);
  if (!block) return null;
  block[':block/string'] = nextString;
  // refresh TODO/DONE ref to match the rewritten marker
  const refs = (block[':block/refs'] ?? []).filter(
    (r) => r[':node/title'] !== 'TODO' && r[':node/title'] !== 'DONE',
  );
  if (nextString.includes('{{[[DONE]]}}')) refs.push({ ':node/title': 'DONE' });
  else if (nextString.includes('{{[[TODO]]}}')) refs.push({ ':node/title': 'TODO' });
  block[':block/refs'] = refs;
  return block;
}

export function isFixtureMode(): boolean {
  return !!process.env.FIXTURE_PATH;
}

export function fixturePath(): string {
  const p = process.env.FIXTURE_PATH;
  if (!p) throw new Error('FIXTURE_PATH not set');
  return p;
}
