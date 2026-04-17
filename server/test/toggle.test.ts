import { describe, expect, it } from 'vitest';
import { rewriteMarker } from '../src/gantt/markers.js';

describe('rewriteMarker', () => {
  it('TODO → DONE replaces marker', () => {
    expect(rewriteMarker('{{[[TODO]]}} ship it', 'DONE')).toBe('{{[[DONE]]}} ship it');
  });
  it('DONE → TODO replaces marker', () => {
    expect(rewriteMarker('{{[[DONE]]}} ship it', 'TODO')).toBe('{{[[TODO]]}} ship it');
  });
  it('no marker → inserts TODO at start', () => {
    expect(rewriteMarker('ship it', 'TODO')).toBe('{{[[TODO]]}} ship it');
  });
  it('no marker → inserts DONE at start', () => {
    expect(rewriteMarker('ship it', 'DONE')).toBe('{{[[DONE]]}} ship it');
  });
  it('already at target → no change', () => {
    expect(rewriteMarker('{{[[DONE]]}} ship it', 'DONE')).toBe('{{[[DONE]]}} ship it');
    expect(rewriteMarker('{{[[TODO]]}} ship it', 'TODO')).toBe('{{[[TODO]]}} ship it');
  });
});
