import { describe, expect, it } from 'vitest';
import { shapeBlocks } from '../src/gantt/shape.js';
import type { RoamBlockPull, TagScope } from '../src/types.js';

const scope = (over: Partial<TagScope> = {}): TagScope => ({
  tags: [],
  prefix: null,
  includeDone: false,
  onlyTodos: true,
  groupBy: 'tag',
  ...over,
});

function block(over: Partial<RoamBlockPull>): RoamBlockPull {
  return {
    ':block/uid': 'u',
    ':block/string': '',
    ':block/page': { ':node/title': 'not a date' },
    ...over,
  };
}

describe('shapeBlocks', () => {
  it('primary tag prefers exact match order, then prefix', () => {
    const scp = scope({ tags: ['proj/beta'], prefix: 'proj/' });
    const blocks: RoamBlockPull[] = [
      block({
        ':block/uid': 'a',
        ':block/string': '{{[[TODO]]}} x #proj/alpha #proj/beta',
        ':block/refs': [
          { ':node/title': 'TODO' },
          { ':node/title': 'proj/alpha' },
          { ':node/title': 'proj/beta' },
        ],
        ':block/page': { ':node/title': 'April 1st, 2026' },
      }),
    ];
    const { rows } = shapeBlocks(blocks, scp);
    expect(rows).toHaveLength(1);
    expect(rows[0].primaryTag).toBe('proj/beta');
    expect(rows[0].tags).toContain('proj/alpha');
    expect(rows[0].tags).toContain('proj/beta');
  });

  it('hides DONE by default, shows with includeDone', () => {
    const blocks: RoamBlockPull[] = [
      block({
        ':block/uid': 'd',
        ':block/string': '{{[[DONE]]}} done thing',
        ':block/refs': [
          { ':node/title': 'DONE' },
          { ':node/title': 'proj/alpha' },
        ],
        ':block/page': { ':node/title': 'April 1st, 2026' },
      }),
    ];
    expect(shapeBlocks(blocks, scope({ prefix: 'proj/' })).rows).toHaveLength(0);
    expect(shapeBlocks(blocks, scope({ prefix: 'proj/', includeDone: true })).rows)
      .toHaveLength(1);
  });

  it('unscheduled bucket captures rows with no dates', () => {
    const blocks: RoamBlockPull[] = [
      block({
        ':block/uid': 'n',
        ':block/string': '{{[[TODO]]}} no dates',
        ':block/refs': [{ ':node/title': 'TODO' }, { ':node/title': 'proj/x' }],
        ':block/page': { ':node/title': 'not a date' },
      }),
    ];
    const { rows, unscheduled } = shapeBlocks(blocks, scope({ prefix: 'proj/' }));
    expect(rows).toHaveLength(0);
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].source).toBe('none');
    expect(unscheduled[0].start).toBeNull();
  });

  it('cleans {{[[TODO]]}} and matched #tag from title', () => {
    const blocks: RoamBlockPull[] = [
      block({
        ':block/uid': 'c',
        ':block/string': '{{[[TODO]]}} ship beta #proj/alpha',
        ':block/refs': [
          { ':node/title': 'TODO' },
          { ':node/title': 'proj/alpha' },
        ],
        ':block/page': { ':node/title': 'April 1st, 2026' },
      }),
    ];
    const { rows } = shapeBlocks(blocks, scope({ prefix: 'proj/' }));
    expect(rows[0].title).toBe('ship beta');
  });

  it('onlyTodos=false keeps non-TODO blocks', () => {
    const blocks: RoamBlockPull[] = [
      block({
        ':block/uid': 'p',
        ':block/string': 'plain tagged note',
        ':block/refs': [{ ':node/title': 'proj/alpha' }],
        ':block/page': { ':node/title': 'April 1st, 2026' },
      }),
    ];
    expect(shapeBlocks(blocks, scope({ prefix: 'proj/', onlyTodos: true })).rows)
      .toHaveLength(0);
    expect(shapeBlocks(blocks, scope({ prefix: 'proj/', onlyTodos: false })).rows)
      .toHaveLength(1);
  });
});
