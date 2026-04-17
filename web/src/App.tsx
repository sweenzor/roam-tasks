import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ConfigPanel } from './components/ConfigPanel';
import { GanttView } from './components/GanttView';
import { UnscheduledLane } from './components/UnscheduledLane';
import { TaskDetail } from './components/TaskDetail';
import { fetchTasks, toggleTask } from './lib/api';
import { useConfig } from './lib/useConfig';
import type { GanttRow, TaskQuery, TasksResponse } from './types';

function queryOf(config: ReturnType<typeof useConfig>[0]): TaskQuery {
  return {
    tags: config.tags,
    prefix: config.prefix,
    includeDone: config.includeDone,
    onlyTodos: config.onlyTodos,
    groupBy: config.groupBy,
  };
}

export default function App() {
  const [config, setConfig] = useConfig();
  const [selected, setSelected] = useState<GanttRow | null>(null);
  const queryClient = useQueryClient();
  const query = useMemo(() => queryOf(config), [config]);
  const queryKey = useMemo(() => ['tasks', query] as const, [query]);

  const enabled = query.tags.length > 0 || !!query.prefix;

  const tasksQuery = useQuery<TasksResponse>({
    queryKey,
    queryFn: ({ signal }) => fetchTasks(query, signal),
    enabled,
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { uid: string; next: 'TODO' | 'DONE' }) =>
      toggleTask(args.uid, args.next, query),
    onMutate: async ({ uid, next }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TasksResponse>(queryKey);
      if (prev) {
        const apply = (row: GanttRow): GanttRow =>
          row.id === uid ? { ...row, state: next } : row;
        queryClient.setQueryData<TasksResponse>(queryKey, {
          rows: prev.rows.map(apply),
          unscheduled: prev.unscheduled.map(apply),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const data = tasksQuery.data ?? { rows: [], unscheduled: [] };

  return (
    <div className="app">
      <header className="app-header">
        <h1>roam-gantt</h1>
      </header>
      <ConfigPanel
        config={config}
        onChange={setConfig}
        onRefresh={() => tasksQuery.refetch()}
        isFetching={tasksQuery.isFetching}
      />
      {!enabled && (
        <p className="hint">Enter a tag list or a prefix to load tasks.</p>
      )}
      {tasksQuery.isError && (
        <p className="error">
          Failed to load: {(tasksQuery.error as Error).message}
        </p>
      )}
      <UnscheduledLane rows={data.unscheduled} onSelect={setSelected} />
      <GanttView
        rows={data.rows}
        groupBy={config.groupBy}
        onSelect={setSelected}
      />
      {selected && (
        <TaskDetail
          row={selected}
          graph={config.graph}
          onClose={() => setSelected(null)}
          onToggle={(next) =>
            toggleMutation.mutate(
              { uid: selected.id, next },
              {
                onSuccess: ({ updated }) => {
                  if (updated) setSelected(updated);
                },
              },
            )
          }
          isToggling={toggleMutation.isPending}
        />
      )}
    </div>
  );
}
