import type { GanttRow } from '../types';

type Props = {
  rows: GanttRow[];
  onSelect: (row: GanttRow) => void;
};

export function UnscheduledLane({ rows, onSelect }: Props) {
  return (
    <section className="unscheduled-lane">
      <header>
        <h2>Unscheduled</h2>
        <span className="count">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="empty">Every matched TODO has a resolvable date.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect(r)}>
                <span className="tag">{r.primaryTag}</span>
                <span className="title">{r.title}</span>
                <span className="page">{r.page}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
