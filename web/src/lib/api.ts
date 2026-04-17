import type { GanttRow, TaskQuery, TasksResponse } from '../types';

function toSearch(q: TaskQuery): string {
  const p = new URLSearchParams();
  if (q.tags.length) p.set('tags', q.tags.join(','));
  if (q.prefix) p.set('prefix', q.prefix);
  p.set('includeDone', String(q.includeDone));
  p.set('onlyTodos', String(q.onlyTodos));
  p.set('groupBy', q.groupBy);
  return p.toString();
}

export async function fetchTasks(q: TaskQuery, signal?: AbortSignal): Promise<TasksResponse> {
  const res = await fetch(`/api/tasks?${toSearch(q)}`, { signal });
  if (!res.ok) throw new Error(`fetchTasks failed: ${res.status}`);
  return res.json();
}

export async function toggleTask(
  uid: string,
  next: 'TODO' | 'DONE',
  q: TaskQuery,
): Promise<{ updated: GanttRow | null }> {
  const res = await fetch(`/api/tasks/${uid}/toggle?${toSearch(q)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ next }),
  });
  if (!res.ok) throw new Error(`toggleTask failed: ${res.status}`);
  return res.json();
}
