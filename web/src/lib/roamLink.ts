export function roamBlockUrl(graph: string | undefined, uid: string): string {
  const g = graph && graph.length ? graph : 'graph';
  return `roam://#/app/${encodeURIComponent(g)}/page/${encodeURIComponent(uid)}`;
}
