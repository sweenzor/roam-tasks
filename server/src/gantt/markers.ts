export const TODO_MARK = '{{[[TODO]]}}';
export const DONE_MARK = '{{[[DONE]]}}';

export type ToggleState = 'TODO' | 'DONE';

export function rewriteMarker(current: string, next: ToggleState): string {
  const other = next === 'TODO' ? DONE_MARK : TODO_MARK;
  const want = next === 'TODO' ? TODO_MARK : DONE_MARK;
  if (current.includes(want)) return current;
  if (current.includes(other)) return current.replace(other, want);
  return `${want} ${current}`.trim();
}
