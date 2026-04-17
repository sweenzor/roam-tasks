import type { Config } from '../lib/useConfig';

type Props = {
  config: Config;
  onChange: (next: Partial<Config>) => void;
  onRefresh: () => void;
  isFetching: boolean;
};

export function ConfigPanel({ config, onChange, onRefresh, isFetching }: Props) {
  return (
    <form
      className="config-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onRefresh();
      }}
    >
      <label>
        Graph
        <input
          type="text"
          placeholder="(optional, used for Roam deep links)"
          value={config.graph}
          onChange={(e) => onChange({ graph: e.target.value })}
        />
      </label>
      <label>
        Tags (csv)
        <input
          type="text"
          placeholder="proj/alpha, design-review"
          value={config.tags.join(', ')}
          onChange={(e) =>
            onChange({
              tags: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <label>
        Prefix
        <input
          type="text"
          placeholder="proj/"
          value={config.prefix}
          onChange={(e) => onChange({ prefix: e.target.value })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={config.includeDone}
          onChange={(e) => onChange({ includeDone: e.target.checked })}
        />
        Include DONE
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={config.onlyTodos}
          onChange={(e) => onChange({ onlyTodos: e.target.checked })}
        />
        Only TODOs
      </label>
      <label>
        Group by
        <select
          value={config.groupBy}
          onChange={(e) =>
            onChange({ groupBy: e.target.value as Config['groupBy'] })
          }
        >
          <option value="tag">Primary tag</option>
          <option value="page">Page</option>
          <option value="none">None</option>
        </select>
      </label>
      <button type="submit" disabled={isFetching}>
        {isFetching ? 'Loading…' : 'Refresh'}
      </button>
    </form>
  );
}
