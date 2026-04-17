import { DONE_MARK, TODO_MARK } from './markers.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanTitle(raw: string, matchedTags: string[]): string {
  let cleaned = raw.split(TODO_MARK).join('').split(DONE_MARK).join('');
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
