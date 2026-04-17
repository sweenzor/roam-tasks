import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rewriteMarker, type ToggleState } from '../gantt/markers.js';
import { shapeBlocks } from '../gantt/shape.js';
import {
  fixtureGetBlock,
  fixturePath,
  fixtureRewriteBlockString,
  isFixtureMode,
} from '../roam/fixture.js';
import { fetchBlockByUid, roamWriteBlockString } from '../roam/client.js';
import { cacheClear } from '../cache.js';
import { parseScopeQuery } from './scope.js';
import type { GanttRow, RoamBlockPull, TagScope } from '../types.js';

const Body = z.object({ next: z.enum(['TODO', 'DONE']) });

type ToggleIO = {
  read: (uid: string) => Promise<RoamBlockPull | null>;
  write: (uid: string, nextString: string) => Promise<RoamBlockPull | null>;
};

const liveIO: ToggleIO = {
  read: fetchBlockByUid,
  write: async (uid, nextString) => {
    await roamWriteBlockString(uid, nextString);
    return fetchBlockByUid(uid);
  },
};

const fixtureIO: ToggleIO = {
  read: (uid) => fixtureGetBlock(fixturePath(), uid),
  write: (uid, nextString) =>
    fixtureRewriteBlockString(fixturePath(), uid, nextString),
};

async function applyToggle(
  io: ToggleIO,
  uid: string,
  next: ToggleState,
  scope: TagScope,
): Promise<{ status: 404 | 502; error: string } | { updated: GanttRow | null }> {
  const current = await io.read(uid);
  if (!current) return { status: 404, error: 'block not found' };
  const nextString = rewriteMarker(current[':block/string'], next);
  const refreshed = await io.write(uid, nextString);
  if (!refreshed) return { status: 502, error: 'block disappeared after write' };
  const shaped = shapeBlocks([refreshed], {
    ...scope,
    includeDone: true,
    onlyTodos: false,
  });
  return { updated: shaped.rows[0] ?? shaped.unscheduled[0] ?? null };
}

export async function registerToggleRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { uid: string } }>('/api/tasks/:uid/toggle', async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const scope = parseScopeQuery(req.query ?? {});
    const io = isFixtureMode() ? fixtureIO : liveIO;
    const result = await applyToggle(io, req.params.uid, parsed.data.next, scope);
    if ('status' in result) {
      reply.code(result.status);
      return { error: result.error };
    }
    cacheClear();
    return result;
  });
}
