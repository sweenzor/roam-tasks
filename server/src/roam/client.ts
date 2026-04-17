import { request } from 'undici';
import { RESOLVE_TAG_PAGES_Q, FETCH_TAGGED_BLOCKS_Q } from './queries.js';
import type { RoamBlockPull, TagScope } from '../types.js';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

type RoamQueryResult = { result: unknown[] };

async function roamQuery(
  query: string,
  args: unknown[] = [],
): Promise<unknown[]> {
  const url = `${env('ROAM_API_URL')}/api/graph/${env('ROAM_GRAPH')}/q`;
  const res = await request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env('ROAM_TOKEN')}`,
    },
    body: JSON.stringify({ query, args }),
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`roam /q failed (${res.statusCode}): ${body}`);
  }
  const json = (await res.body.json()) as RoamQueryResult;
  return json.result ?? [];
}

type RoamWriteAction = { action: 'update-block'; block: { uid: string; string: string } };

export async function roamWriteBlockString(uid: string, nextString: string): Promise<void> {
  const url = `${env('ROAM_API_URL')}/api/graph/${env('ROAM_GRAPH')}/write`;
  const payload: RoamWriteAction = {
    action: 'update-block',
    block: { uid, string: nextString },
  };
  const res = await request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env('ROAM_TOKEN')}`,
    },
    body: JSON.stringify(payload),
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`roam /write failed (${res.statusCode}): ${body}`);
  }
}

async function resolveTagUids(scope: TagScope): Promise<string[]> {
  const rows = (await roamQuery(RESOLVE_TAG_PAGES_Q, [
    scope.tags,
    scope.prefix ?? '',
  ])) as Array<[string, string]>;
  return rows.map(([, uid]) => uid);
}

export async function fetchTaggedBlocks(scope: TagScope): Promise<RoamBlockPull[]> {
  const tagUids = await resolveTagUids(scope);
  if (tagUids.length === 0) return [];
  const rows = (await roamQuery(FETCH_TAGGED_BLOCKS_Q, [tagUids])) as Array<[RoamBlockPull]>;
  const seen = new Set<string>();
  const out: RoamBlockPull[] = [];
  for (const [b] of rows) {
    const uid = b[':block/uid'];
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(b);
  }
  return out;
}

export async function fetchBlockByUid(uid: string): Promise<RoamBlockPull | null> {
  const q = `[:find (pull ?b [:block/uid :block/string
                              {:block/refs [:node/title :block/uid]}
                              {:block/children [:block/string {:block/refs [:node/title]}]}
                              {:block/page [:node/title]}
                              {:block/parents [:block/uid]}])
              :in $ ?uid
              :where [?b :block/uid ?uid]]`;
  const rows = (await roamQuery(q, [uid])) as Array<[RoamBlockPull]>;
  return rows[0]?.[0] ?? null;
}
