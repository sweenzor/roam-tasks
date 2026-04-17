import type { FastifyInstance } from 'fastify';
import { shapeBlocks } from '../gantt/shape.js';
import { fixtureFetchBlocks, fixturePath, isFixtureMode } from '../roam/fixture.js';
import { fetchTaggedBlocks } from '../roam/client.js';
import { cacheGet, cacheSet } from '../cache.js';
import { safeParseScopeQuery } from './scope.js';
import type { TagScope, TasksResponse } from '../types.js';

function scopeKey(scope: TagScope): string {
  return JSON.stringify([
    scope.tags.slice().sort(),
    scope.prefix ?? '',
    scope.includeDone,
    scope.onlyTodos,
    scope.groupBy,
  ]);
}

export async function registerTasksRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/tasks', async (req, reply) => {
    const parsed = safeParseScopeQuery(req.query);
    if (!parsed.ok) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const scope = parsed.scope;
    if (scope.tags.length === 0 && !scope.prefix) {
      reply.code(400);
      return { error: 'must provide `tags` or `prefix`' };
    }

    const key = scopeKey(scope);
    const cached = cacheGet<TasksResponse>(key);
    if (cached) return cached;

    const blocks = isFixtureMode()
      ? await fixtureFetchBlocks(fixturePath(), scope)
      : await fetchTaggedBlocks(scope);
    const shaped = shapeBlocks(blocks, scope);
    cacheSet(key, shaped);
    return shaped;
  });
}
