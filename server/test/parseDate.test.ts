import { describe, expect, it } from 'vitest';
import { parseDate } from '../src/gantt/parseDate.js';

describe('parseDate', () => {
  it('parses all ordinal suffixes', () => {
    expect(parseDate('March 1st, 2025')).toBe('2025-03-01');
    expect(parseDate('March 2nd, 2025')).toBe('2025-03-02');
    expect(parseDate('March 3rd, 2025')).toBe('2025-03-03');
    expect(parseDate('March 4th, 2025')).toBe('2025-03-04');
    expect(parseDate('March 11th, 2025')).toBe('2025-03-11');
    expect(parseDate('March 21st, 2025')).toBe('2025-03-21');
    expect(parseDate('March 22nd, 2025')).toBe('2025-03-22');
    expect(parseDate('March 23rd, 2025')).toBe('2025-03-23');
  });

  it('parses all months', () => {
    expect(parseDate('January 5, 2024')).toBe('2024-01-05');
    expect(parseDate('February 5th, 2024')).toBe('2024-02-05');
    expect(parseDate('April 5th, 2024')).toBe('2024-04-05');
    expect(parseDate('May 5th, 2024')).toBe('2024-05-05');
    expect(parseDate('June 5th, 2024')).toBe('2024-06-05');
    expect(parseDate('July 5th, 2024')).toBe('2024-07-05');
    expect(parseDate('August 5th, 2024')).toBe('2024-08-05');
    expect(parseDate('September 5th, 2024')).toBe('2024-09-05');
    expect(parseDate('October 5th, 2024')).toBe('2024-10-05');
    expect(parseDate('November 5th, 2024')).toBe('2024-11-05');
    expect(parseDate('December 5th, 2024')).toBe('2024-12-05');
  });

  it('accepts leap day', () => {
    expect(parseDate('February 29th, 2024')).toBe('2024-02-29');
  });

  it('rejects invalid dates', () => {
    expect(parseDate('February 30th, 2024')).toBeNull();
    expect(parseDate('February 29th, 2025')).toBeNull();
    expect(parseDate('April 31st, 2024')).toBeNull();
  });

  it('returns null on junk', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('2024-03-14')).toBeNull();
  });
});
