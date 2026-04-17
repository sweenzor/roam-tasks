import { z } from 'zod';
import type { TagScope } from '../types.js';

const BoolLike = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true');

export const ScopeQuerySchema = z.object({
  tags: z.string().optional().default(''),
  prefix: z.string().optional().default(''),
  includeDone: BoolLike.optional(),
  onlyTodos: BoolLike.optional(),
  groupBy: z.enum(['tag', 'page', 'none']).optional().default('tag'),
});

export function parseScopeQuery(raw: unknown): TagScope {
  const parsed = ScopeQuerySchema.parse(raw);
  return {
    tags: parsed.tags
      ? parsed.tags.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    prefix: parsed.prefix || null,
    includeDone: parsed.includeDone ?? false,
    onlyTodos: parsed.onlyTodos ?? true,
    groupBy: parsed.groupBy,
  };
}

export function safeParseScopeQuery(
  raw: unknown,
): { ok: true; scope: TagScope } | { ok: false; error: z.ZodError } {
  const parsed = ScopeQuerySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, scope: parseScopeQuery(raw) };
}
