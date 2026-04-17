import { useEffect, useMemo, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import type { GanttRow, TaskQuery } from '../types';

type Props = {
  rows: GanttRow[];
  groupBy: TaskQuery['groupBy'];
  onSelect: (row: GanttRow) => void;
};

type Mode = 'Day' | 'Week' | 'Month';

type FrappeTask = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  custom_class?: string;
  dependencies?: string;
};

function toFrappeTasks(rows: GanttRow[], groupBy: Props['groupBy']): FrappeTask[] {
  const sorted = [...rows].sort((a, b) => {
    const groupCmp = groupKey(a, groupBy).localeCompare(groupKey(b, groupBy));
    if (groupCmp !== 0) return groupCmp;
    return (a.start ?? '').localeCompare(b.start ?? '');
  });
  const visibleIds = new Set(
    sorted.filter((r) => r.start && r.end).map((r) => r.id),
  );
  return sorted
    .filter((r): r is GanttRow & { start: string; end: string } => !!r.start && !!r.end)
    .map((r) => ({
      id: r.id,
      name: labelFor(r, groupBy),
      start: r.start,
      end: r.end,
      progress: r.state === 'DONE' ? 100 : 0,
      custom_class: r.state === 'DONE' ? 'bar-done' : 'bar-todo',
      dependencies: r.dependsOn.filter((d) => visibleIds.has(d)).join(','),
    }));
}

function groupKey(r: GanttRow, groupBy: Props['groupBy']): string {
  if (groupBy === 'tag') return r.primaryTag ?? '';
  if (groupBy === 'page') return r.page;
  return '';
}

function labelFor(r: GanttRow, groupBy: Props['groupBy']): string {
  const prefix = groupKey(r, groupBy);
  return prefix ? `[${prefix}] ${r.title}` : r.title;
}

export function GanttView({ rows, groupBy, onSelect }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('Week');

  const tasks = useMemo(() => toFrappeTasks(rows, groupBy), [rows, groupBy]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    if (tasks.length === 0) {
      ganttRef.current = null;
      return;
    }
    ganttRef.current = new Gantt(ref.current, tasks, {
      view_mode: mode,
      bar_height: 24,
      padding: 14,
      on_click: (t: { id: string }) => {
        const row = rows.find((r) => r.id === t.id);
        if (row) onSelect(row);
      },
    });
  }, [tasks, mode, rows, onSelect]);

  return (
    <div className="gantt-view">
      <div className="gantt-controls">
        {(['Day', 'Week', 'Month'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="empty">No scheduled tasks for this scope.</div>
      ) : (
        <div ref={ref} className="gantt-canvas" />
      )}
    </div>
  );
}
