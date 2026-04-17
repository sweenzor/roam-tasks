import { describe, expect, it } from 'vitest';
import { detectState, extractDates } from '../src/gantt/extract.js';
import type { RoamBlockPull } from '../src/types.js';

function mk(partial: Partial<RoamBlockPull>): RoamBlockPull {
  return {
    ':block/uid': 'u',
    ':block/string': '',
    ...partial,
  };
}

describe('extractDates', () => {
  it('uses start+end attrs as a range', () => {
    const block = mk({
      ':block/children': [
        { ':block/string': 'start::', ':block/refs': [{ ':node/title': 'April 1st, 2026' }] },
        { ':block/string': 'end::', ':block/refs': [{ ':node/title': 'April 10th, 2026' }] },
      ],
    });
    expect(extractDates(block)).toEqual({
      start: '2026-04-01', end: '2026-04-10', source: 'attrs',
    });
  });

  it('treats start+due as a range', () => {
    const block = mk({
      ':block/children': [
        { ':block/string': 'start::', ':block/refs': [{ ':node/title': 'April 1st, 2026' }] },
        { ':block/string': 'due::', ':block/refs': [{ ':node/title': 'April 5th, 2026' }] },
      ],
    });
    const r = extractDates(block);
    expect(r).toEqual({ start: '2026-04-01', end: '2026-04-05', source: 'attrs' });
  });

  it('treats due-only as single-day', () => {
    const block = mk({
      ':block/children': [
        { ':block/string': 'due::', ':block/refs': [{ ':node/title': 'April 5th, 2026' }] },
      ],
    });
    expect(extractDates(block)).toEqual({
      start: '2026-04-05', end: '2026-04-05', source: 'attrs',
    });
  });

  it('attrs beat inline refs', () => {
    const block = mk({
      ':block/refs': [
        { ':node/title': 'December 1st, 2020' },
        { ':node/title': 'December 10th, 2020' },
      ],
      ':block/children': [
        { ':block/string': 'start::', ':block/refs': [{ ':node/title': 'April 1st, 2026' }] },
      ],
    });
    const r = extractDates(block);
    expect(r.source).toBe('attrs');
    expect(r.start).toBe('2026-04-01');
  });

  it('single inline date → single-day', () => {
    const block = mk({
      ':block/refs': [{ ':node/title': 'April 5th, 2026' }],
    });
    expect(extractDates(block)).toEqual({
      start: '2026-04-05', end: '2026-04-05', source: 'inline',
    });
  });

  it('two inline dates → min/max range', () => {
    const block = mk({
      ':block/refs': [
        { ':node/title': 'April 20th, 2026' },
        { ':node/title': 'April 1st, 2026' },
      ],
    });
    expect(extractDates(block)).toEqual({
      start: '2026-04-01', end: '2026-04-20', source: 'inline',
    });
  });

  it('falls back to daily-note page', () => {
    const block = mk({
      ':block/page': { ':node/title': 'April 17th, 2026' },
    });
    expect(extractDates(block)).toEqual({
      start: '2026-04-17', end: '2026-04-17', source: 'daily-note',
    });
  });

  it('returns none when nothing resolves', () => {
    const block = mk({
      ':block/page': { ':node/title': 'some project page' },
      ':block/refs': [{ ':node/title': 'TODO' }],
    });
    expect(extractDates(block)).toEqual({
      start: null, end: null, source: 'none',
    });
  });
});

describe('detectState', () => {
  it('detects TODO via ref', () => {
    expect(detectState({
      ':block/uid': 'u', ':block/string': '{{[[TODO]]}} x',
      ':block/refs': [{ ':node/title': 'TODO' }],
    })).toBe('TODO');
  });
  it('detects DONE via ref', () => {
    expect(detectState({
      ':block/uid': 'u', ':block/string': '{{[[DONE]]}} x',
      ':block/refs': [{ ':node/title': 'DONE' }],
    })).toBe('DONE');
  });
  it('returns null on plain tagged block', () => {
    expect(detectState({
      ':block/uid': 'u', ':block/string': 'plain',
      ':block/refs': [{ ':node/title': 'proj/alpha' }],
    })).toBeNull();
  });
});
