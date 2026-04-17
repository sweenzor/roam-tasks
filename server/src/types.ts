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
};

export type TasksResponse = {
  rows: GanttRow[];
  unscheduled: GanttRow[];
};

export type RoamRef = { ':node/title'?: string; ':block/uid'?: string };
export type RoamChild = { ':block/string': string; ':block/refs'?: RoamRef[] };
export type RoamPage = { ':node/title': string };
export type RoamParent = { ':block/uid': string };

export type RoamBlockPull = {
  ':block/uid': string;
  ':block/string': string;
  ':create/time'?: number;
  ':edit/time'?: number;
  ':block/refs'?: RoamRef[];
  ':block/children'?: RoamChild[];
  ':block/page'?: RoamPage;
  ':block/parents'?: RoamParent[];
};

export type TagScope = {
  tags: string[];
  prefix: string | null;
  includeDone: boolean;
  onlyTodos: boolean;
  groupBy: 'tag' | 'page' | 'none';
};
