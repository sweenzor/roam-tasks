import { roamBlockUrl } from '../lib/roamLink';
import type { GanttRow } from '../types';

type Props = {
  row: GanttRow;
  graph: string;
  onClose: () => void;
  onToggle: (next: 'TODO' | 'DONE') => void;
  isToggling: boolean;
};

export function TaskDetail({ row, graph, onClose, onToggle, isToggling }: Props) {
  const nextState: 'TODO' | 'DONE' = row.state === 'DONE' ? 'TODO' : 'DONE';
  return (
    <aside className="task-detail">
      <header>
        <h3>{row.title}</h3>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>
      <dl>
        <dt>State</dt>
        <dd>{row.state ?? '—'}</dd>
        <dt>Start</dt>
        <dd>{row.start ?? '—'}</dd>
        <dt>End</dt>
        <dd>{row.end ?? '—'}</dd>
        <dt>Source</dt>
        <dd>{row.source}</dd>
        <dt>Tags</dt>
        <dd>{row.tags.join(', ')}</dd>
        <dt>Page</dt>
        <dd>{row.page}</dd>
      </dl>
      <div className="actions">
        <button
          type="button"
          disabled={isToggling || row.state === null}
          onClick={() => onToggle(nextState)}
        >
          {isToggling ? 'Toggling…' : `Mark ${nextState}`}
        </button>
        <a href={roamBlockUrl(graph, row.id)} target="_blank" rel="noreferrer">
          Open in Roam ↗
        </a>
      </div>
    </aside>
  );
}
