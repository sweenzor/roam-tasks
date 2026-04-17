export type DateSource = 'attrs' | 'inline' | 'daily-note' | 'none';
export type TaskState = 'TODO' | 'DONE' | null;

export type GanttRow = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  state: TaskState;
  tags: string[];
  primaryTag: string;
  page: string;
  parentUid: string | null;
  source: DateSource;
  dependsOn: string[];
};

export type TasksResponse = {
  rows: GanttRow[];
  unscheduled: GanttRow[];
};

export type TaskQuery = {
  tags: string[];
  prefix: string;
  includeDone: boolean;
  onlyTodos: boolean;
  groupBy: 'tag' | 'page' | 'none';
};
