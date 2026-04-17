const TODO_MARK = /\{\{\[\[TODO\]\]\}\}/g;
const DONE_MARK = /\{\{\[\[DONE\]\]\}\}/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanTitle(raw: string, matchedTags: string[]): string {
  let cleaned = raw.replace(TODO_MARK, '').replace(DONE_MARK, '');
  for (const tag of matchedTags) {
    const esc = escapeRegex(tag);
    // strip #tag, #[[tag]], and [[tag]] trailing or free-standing refs
    cleaned = cleaned
      .replace(new RegExp(`#\\[\\[${esc}\\]\\]`, 'g'), '')
      .replace(new RegExp(`#${esc}(?=\\s|$|[^\\w/-])`, 'g'), '')
      .replace(new RegExp(`\\[\\[${esc}\\]\\]`, 'g'), '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}
