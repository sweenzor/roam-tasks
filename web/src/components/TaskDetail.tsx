import { roamBlockUrl } from '../lib/roamLink';
import type { GanttRow } from '../types';

type Props = {
  row: GanttRow;
  allRows: GanttRow[];
  graph: string;
  onClose: () => void;
  onSelect: (row: GanttRow) => void;
  onToggle: (next: 'TODO' | 'DONE') => void;
  isToggling: boolean;
};

function useRelatedRows(row: GanttRow, allRows: GanttRow[]) {
  const byId = new Map(allRows.map((r) => [r.id, r]));
  const blockedBy = row.dependsOn
    .map((id) => byId.get(id))
    .filter((r): r is GanttRow => !!r);
  const blocks = allRows.filter((r) => r.dependsOn.includes(row.id));
  return { blockedBy, blocks };
}

export function TaskDetail({
  row, allRows, graph, onClose, onSelect, onToggle, isToggling,
}: Props) {
  const nextState: 'TODO' | 'DONE' = row.state === 'DONE' ? 'TODO' : 'DONE';
  const { blockedBy, blocks } = useRelatedRows(row, allRows);
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
      <RelatedList label="Blocked by" rows={blockedBy} onSelect={onSelect} />
      <RelatedList label="Blocks" rows={blocks} onSelect={onSelect} />
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

function RelatedList({
  label, rows, onSelect,
}: { label: string; rows: GanttRow[]; onSelect: (r: GanttRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <section className="related">
      <h4>{label}</h4>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onSelect(r)}>
              <span className={r.state === 'DONE' ? 'state done' : 'state todo'}>
                {r.state ?? '—'}
              </span>
              <span className="title">{r.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
