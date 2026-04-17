import { describe, expect, it } from 'vitest';
import { dedupeEdges, extractEdges, filterToScope } from '../src/gantt/deps.js';
import { shapeBlocks } from '../src/gantt/shape.js';
import type { RoamBlockPull, TagScope } from '../src/types.js';

const scope = (over: Partial<TagScope> = {}): TagScope => ({
  tags: [],
  prefix: 'proj/',
  includeDone: false,
  onlyTodos: true,
  groupBy: 'tag',
  ...over,
});

const todoBlock = (over: Partial<RoamBlockPull>): RoamBlockPull => ({
  ':block/uid': 'u',
  ':block/string': '{{[[TODO]]}} x',
  ':block/refs': [
    { ':node/title': 'TODO' },
    { ':node/title': 'proj/alpha' },
  ],
  ':block/children': [],
  ':block/page': { ':node/title': 'April 1st, 2026' },
  ...over,
});

describe('extractEdges', () => {
  it('blocks:: on A pointing at B → edge A→B', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/children': [
        {
          ':block/string': 'blocks:: ((B))',
          ':block/refs': [{ ':block/uid': 'B' }],
        },
      ],
    });
    expect(extractEdges(a)).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('blocked-by:: on A pointing at Y → edge Y→A', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/children': [
        {
          ':block/string': 'blocked-by:: ((Y))',
          ':block/refs': [{ ':block/uid': 'Y' }],
        },
      ],
    });
    expect(extractEdges(a)).toEqual([{ from: 'Y', to: 'A' }]);
  });

  it('multiple targets in one attr produce multiple edges', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/children': [
        {
          ':block/string': 'blocks:: ((B)) ((C))',
          ':block/refs': [{ ':block/uid': 'B' }, { ':block/uid': 'C' }],
        },
      ],
    });
    expect(extractEdges(a)).toEqual([
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
    ]);
  });

  it('ignores self-loops', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/children': [
        { ':block/string': 'blocks:: ((A))', ':block/refs': [{ ':block/uid': 'A' }] },
      ],
    });
    expect(extractEdges(a)).toEqual([]);
  });

  it('scrapes ((uid)) from string when refs lack :block/uid', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/children': [
        { ':block/string': 'blocked-by:: ((Z))' }, // no refs array at all
      ],
    });
    expect(extractEdges(a)).toEqual([{ from: 'Z', to: 'A' }]);
  });
});

describe('dedupeEdges', () => {
  it('collapses duplicate (from,to)', () => {
    expect(
      dedupeEdges([
        { from: 'A', to: 'B' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ]),
    ).toEqual([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ]);
  });
});

describe('filterToScope', () => {
  it('drops edges whose endpoints are out of scope', () => {
    const kept = new Set(['A', 'B']);
    expect(
      filterToScope(
        [
          { from: 'A', to: 'B' },
          { from: 'A', to: 'Z' },
          { from: 'Y', to: 'A' },
        ],
        kept,
      ),
    ).toEqual([{ from: 'A', to: 'B' }]);
  });
});

describe('shapeBlocks with deps', () => {
  it('both-sides declaration produces a single edge', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/string': '{{[[TODO]]}} A #proj/alpha',
      ':block/children': [
        {
          ':block/string': 'blocks:: ((B))',
          ':block/refs': [{ ':block/uid': 'B' }],
        },
      ],
    });
    const b = todoBlock({
      ':block/uid': 'B',
      ':block/string': '{{[[TODO]]}} B #proj/alpha',
      ':block/children': [
        {
          ':block/string': 'blocked-by:: ((A))',
          ':block/refs': [{ ':block/uid': 'A' }],
        },
      ],
    });
    const { rows } = shapeBlocks([a, b], scope());
    const rowB = rows.find((r) => r.id === 'B')!;
    const rowA = rows.find((r) => r.id === 'A')!;
    expect(rowB.dependsOn).toEqual(['A']);
    expect(rowA.dependsOn).toEqual([]);
  });

  it('edge pointing out of scope is dropped', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/string': '{{[[TODO]]}} A #proj/alpha',
      ':block/children': [
        { ':block/string': 'blocks:: ((ZZ))', ':block/refs': [{ ':block/uid': 'ZZ' }] },
      ],
    });
    const { rows } = shapeBlocks([a], scope());
    expect(rows[0].dependsOn).toEqual([]);
  });

  it('unscheduled rows still carry dependsOn', () => {
    const a = todoBlock({
      ':block/uid': 'A',
      ':block/string': '{{[[TODO]]}} A #proj/alpha',
      ':block/children': [
        { ':block/string': 'blocks:: ((B))', ':block/refs': [{ ':block/uid': 'B' }] },
      ],
      ':block/page': { ':node/title': 'not a date' },
    });
    const b = todoBlock({
      ':block/uid': 'B',
      ':block/string': '{{[[TODO]]}} B #proj/alpha',
      ':block/page': { ':node/title': 'not a date' },
    });
    const { unscheduled } = shapeBlocks([a, b], scope());
    const uB = unscheduled.find((r) => r.id === 'B')!;
    expect(uB.dependsOn).toEqual(['A']);
  });
});
