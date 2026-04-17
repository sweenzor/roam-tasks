declare module 'frappe-gantt' {
  export type FrappeTask = {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    custom_class?: string;
  };

  export type FrappeOptions = Partial<{
    header_height: number;
    column_width: number;
    step: number;
    view_modes: string[];
    bar_height: number;
    bar_corner_radius: number;
    arrow_curve: number;
    padding: number;
    view_mode: 'Day' | 'Week' | 'Month' | 'Quarter Day' | 'Half Day' | 'Year';
    date_format: string;
    language: string;
    custom_popup_html: unknown;
    on_click: (task: FrappeTask) => void;
    on_date_change: (task: FrappeTask, start: Date, end: Date) => void;
    on_progress_change: (task: FrappeTask, progress: number) => void;
    on_view_change: (mode: string) => void;
  }>;

  export default class Gantt {
    constructor(target: HTMLElement | string, tasks: FrappeTask[], options?: FrappeOptions);
    change_view_mode(mode: string): void;
    refresh(tasks: FrappeTask[]): void;
  }
}
