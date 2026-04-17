import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { shapeBlocks } from '../gantt/shape.js';
import { fixtureFetchBlocks, fixturePath, isFixtureMode } from '../roam/fixture.js';
import { fetchTaggedBlocks } from '../roam/client.js';
import { cacheGet, cacheSet } from '../cache.js';
import type { TagScope, TasksResponse } from '../types.js';

const QuerySchema = z.object({
  tags: z.string().optional().default(''),
  prefix: z.string().optional().default(''),
  includeDone: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  onlyTodos: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? true : v === true || v === 'true')),
  groupBy: z.enum(['tag', 'page', 'none']).optional().default('tag'),
});

function parseScope(raw: z.infer<typeof QuerySchema>): TagScope {
  return {
    tags: raw.tags ? raw.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    prefix: raw.prefix ? raw.prefix : null,
    includeDone: !!raw.includeDone,
    onlyTodos: raw.onlyTodos ?? true,
    groupBy: raw.groupBy,
  };
}

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
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const scope = parseScope(parsed.data);
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
