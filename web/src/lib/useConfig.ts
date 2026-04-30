import { useEffect, useState } from 'react';
import type { TaskQuery } from '../types';

const KEY = 'roam-tasks.config.v1';

const DEFAULT: TaskQuery & { graph: string } = {
  tags: [],
  prefix: 'proj/',
  includeDone: false,
  onlyTodos: true,
  groupBy: 'tag',
  graph: '',
};

export type Config = TaskQuery & { graph: string };

export function useConfig(): [Config, (next: Partial<Config>) => void] {
  const [config, setConfig] = useState<Config>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULT;
      return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Config>) };
    } catch {
      return DEFAULT;
    }
  });
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(config));
  }, [config]);
  return [config, (next) => setConfig((c) => ({ ...c, ...next }))];
}
