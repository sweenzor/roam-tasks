import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { shapeBlocks } from '../gantt/shape.js';
import {
  fixturePath,
  fixtureRewriteBlockString,
  isFixtureMode,
} from '../roam/fixture.js';
import { fetchBlockByUid, roamWriteBlockString } from '../roam/client.js';
import { cacheClear } from '../cache.js';
import type { GanttRow, TagScope } from '../types.js';

const Body = z.object({ next: z.enum(['TODO', 'DONE']) });

const TODO = '{{[[TODO]]}}';
const DONE = '{{[[DONE]]}}';

export function rewriteMarker(current: string, next: 'TODO' | 'DONE'): string {
  const other = next === 'TODO' ? DONE : TODO;
  const want = next === 'TODO' ? TODO : DONE;
  if (current.includes(want)) return current;
  if (current.includes(other)) return current.replace(other, want);
  return `${want} ${current}`.trim();
}

function scopeFromParams(q: Record<string, unknown>): TagScope {
  const rawTags = (q.tags as string | undefined) ?? '';
  return {
    tags: rawTags ? rawTags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    prefix: (q.prefix as string | undefined) || null,
    includeDone: q.includeDone === 'true' || q.includeDone === true,
    onlyTodos: q.onlyTodos === undefined ? true : q.onlyTodos === 'true' || q.onlyTodos === true,
    groupBy: ((q.groupBy as string | undefined) ?? 'tag') as TagScope['groupBy'],
  };
}

export async function registerToggleRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { uid: string } }>('/api/tasks/:uid/toggle', async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const { uid } = req.params;
    const { next } = parsed.data;

    let updated: GanttRow | null = null;
    if (isFixtureMode()) {
      const block = await (async () => {
        const path = fixturePath();
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(path, 'utf8');
        const graph = JSON.parse(raw) as { blocks: { ':block/uid': string; ':block/string': string }[] };
        return graph.blocks.find((b) => b[':block/uid'] === uid) ?? null;
      })();
      if (!block) {
        reply.code(404);
        return { error: 'block not found' };
      }
      const nextString = rewriteMarker(block[':block/string'], next);
      const rewritten = await fixtureRewriteBlockString(fixturePath(), uid, nextString);
      if (!rewritten) {
        reply.code(404);
        return { error: 'block not found' };
      }
      const scope = scopeFromParams((req.query ?? {}) as Record<string, unknown>);
      const shaped = shapeBlocks([rewritten], {
        ...scope,
        includeDone: true,
        onlyTodos: false,
      });
      updated = shaped.rows[0] ?? shaped.unscheduled[0] ?? null;
    } else {
      const current = await fetchBlockByUid(uid);
      if (!current) {
        reply.code(404);
        return { error: 'block not found' };
      }
      const nextString = rewriteMarker(current[':block/string'], next);
      await roamWriteBlockString(uid, nextString);
      const refreshed = await fetchBlockByUid(uid);
      if (!refreshed) {
        reply.code(502);
        return { error: 'block disappeared after write' };
      }
      const scope = scopeFromParams((req.query ?? {}) as Record<string, unknown>);
      const shaped = shapeBlocks([refreshed], {
        ...scope,
        includeDone: true,
        onlyTodos: false,
      });
      updated = shaped.rows[0] ?? shaped.unscheduled[0] ?? null;
    }

    cacheClear();
    return { updated };
  });
}
