import { describe, it, expect } from 'vitest';
import { buildFlatRows, dropBand, gapAnchor, isPastListEnd, siblingDropIndex } from './useLayerDnd';
import { reparentNodes, type GroupObject, type LabelObject } from '../../types/Group';

const leaf = (id: string): LabelObject =>
  ({ id, type: 'text', x: 0, y: 0, rotation: 0, props: {} } as unknown as LabelObject);
const group = (id: string, children: LabelObject[]): GroupObject =>
  ({ id, type: 'group', x: 0, y: 0, rotation: 0, children });

describe('buildFlatRows guides', () => {
  // Rows render reversed (z-order top first): data [A, B] -> display B, A.
  it('emits tee/last for sibling children, none at root', () => {
    const rows = buildFlatRows([leaf('a'), group('b', [leaf('x'), leaf('y')])], new Set(['b']));
    expect(rows.map((r) => [r.obj.id, r.guides])).toEqual([
      ['b', []],
      ['y', ['tee']], // y is above x in display -> has a sibling below -> tee
      ['x', ['last']], // x is bottom-most child -> last
      ['a', []],
    ]);
  });

  // Depth 2 locks ancLast[d] (NOT the prototype's d+1): under a last-of-its-level
  // ancestor the outer column must be empty (no through-line), not a line.
  it('uses the ancestor-at-level-d lastness for pass-through columns', () => {
    // g[ p, q[ r ] ], only root -> g is last; q has p below it in display.
    const rows = buildFlatRows(
      [group('g', [leaf('p'), group('q', [leaf('r')])])],
      new Set(['g', 'q']),
    );
    const guidesOf = (id: string) => rows.find((r) => r.obj.id === id)?.guides;
    expect(guidesOf('g')).toEqual([]);
    expect(guidesOf('q')).toEqual(['tee']); // q has sibling p below in display
    expect(guidesOf('r')).toEqual(['empty', 'last']); // col0 empty: g (root) has nothing below
    expect(guidesOf('p')).toEqual(['last']); // p is bottom-most under g
  });
});

describe('siblingDropIndex + reparent (block lands above the over-row in display)', () => {
  // Data [a,b,c,d] displays [d,c,b,a]. display(objects) helper:
  const display = (objs: LabelObject[]) => buildFlatRows(objs, new Set()).map((r) => r.obj.id);
  const top = () => [leaf('a'), leaf('b'), leaf('c'), leaf('d')];

  it('top half (above=true): block lands just above the over-row in display', () => {
    const objs = top();
    const block = ['a', 'b']; // selectionRoots data order
    const idx = siblingDropIndex(objs, 'c', block, true);
    const next = reparentNodes(objs, block, { parentId: null, index: idx });
    expect(display(next)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('bottom half (above=false) on the bottom row reaches the back-most slot', () => {
    const objs = top(); // display [d,c,b,a]; 'a' is back-most (data index 0)
    // Drop 'd' onto the bottom row 'a', bottom half -> below 'a' in display.
    const idx = siblingDropIndex(objs, 'a', ['d'], false);
    const next = reparentNodes(objs, ['d'], { parentId: null, index: idx });
    // d is now the back-most row (bottom of display), which +1-only could not reach.
    expect(display(next)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('single row, top half: lands just above the over-row (no off-by-one)', () => {
    const objs = top();
    const idx = siblingDropIndex(objs, 'b', ['d'], true);
    const next = reparentNodes(objs, ['d'], { parentId: null, index: idx });
    expect(display(next)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('returns -1 when the over-row is itself a mover', () => {
    expect(siblingDropIndex(top(), 'a', ['a', 'b'], true)).toBe(-1);
  });
});

describe('dropBand', () => {
  const rect = { top: 0, height: 100 };

  it('into-capable rows split top/middle/bottom into above/into/below', () => {
    expect(dropBand(10, rect, true)).toBe('above'); // rel .10
    expect(dropBand(29, rect, true)).toBe('above'); // just below the 0.3 edge
    expect(dropBand(31, rect, true)).toBe('into');
    expect(dropBand(50, rect, true)).toBe('into');
    expect(dropBand(69, rect, true)).toBe('into'); // just above the 0.7 edge
    expect(dropBand(90, rect, true)).toBe('below');
  });

  it('non-into rows keep the top/bottom half for above/below', () => {
    expect(dropBand(40, rect, false)).toBe('above');
    expect(dropBand(49, rect, false)).toBe('above');
    expect(dropBand(50, rect, false)).toBe('below'); // 0.5 is not < 0.5
    expect(dropBand(80, rect, false)).toBe('below');
  });

  it('defaults to above when geometry is unknown', () => {
    expect(dropBand(null, rect, true)).toBe('above');
    expect(dropBand(50, null, true)).toBe('above');
    expect(dropBand(50, { top: 0, height: 0 }, true)).toBe('above');
  });
});

describe('gapAnchor', () => {
  // data [g[x,y], a] -> display ['a', 'g', 'y', 'x'] (z-reversed at each level).
  const rows = buildFlatRows(
    [group('g', [leaf('x'), leaf('y')]), leaf('a')],
    new Set(['g']),
  );

  it('anchors a "below" drop at the bottom of an expanded group subtree, not the header', () => {
    // Dropping before 'g' in data = below it in display = past all of g's
    // children, so the gap sits under the last descendant 'x', not under 'g'.
    expect(gapAnchor(rows, 'g', false)).toEqual({ rowId: 'x', above: false });
  });

  it('anchors an "above" drop on the over-row itself', () => {
    expect(gapAnchor(rows, 'g', true)).toEqual({ rowId: 'g', above: true });
  });

  it('leaves a leaf "below" drop on the leaf', () => {
    expect(gapAnchor(rows, 'a', false)).toEqual({ rowId: 'a', above: false });
  });
});

describe('gapAnchor matches the committed landing', () => {
  // The preview (gapAnchor) and the commit (siblingDropIndex + reparentNodes)
  // encode the z-reversed display<->data duality separately; assert they agree
  // so the gap can never advertise a slot the drop won't honour.
  const display = (objs: LabelObject[], expanded: Set<string>) =>
    buildFlatRows(objs, expanded).map((r) => r.obj.id);

  it('below an expanded group: moved item lands just under the gap anchor', () => {
    const objs = [group('g', [leaf('x'), leaf('y')]), leaf('a')];
    const expanded = new Set(['g']);
    const rows = buildFlatRows(objs, expanded);
    const anchor = gapAnchor(rows, 'g', false); // gap below the subtree end 'x'
    const idx = siblingDropIndex(objs, 'g', ['a'], false);
    const next = reparentNodes(objs, ['a'], { parentId: null, index: idx });
    const d = display(next, expanded);
    expect(anchor).toEqual({ rowId: 'x', above: false });
    expect(d.indexOf('a')).toBe(d.indexOf(anchor.rowId) + 1);
  });

  it('above a row: moved item lands just over the gap anchor', () => {
    const objs = [leaf('a'), leaf('b'), leaf('c')]; // display [c, b, a]
    const rows = buildFlatRows(objs, new Set());
    const anchor = gapAnchor(rows, 'c', true);
    const idx = siblingDropIndex(objs, 'c', ['a'], true);
    const next = reparentNodes(objs, ['a'], { parentId: null, index: idx });
    const d = display(next, new Set());
    expect(anchor).toEqual({ rowId: 'c', above: true });
    expect(d.indexOf('a')).toBe(d.indexOf(anchor.rowId) - 1);
  });
});

describe('isPastListEnd', () => {
  const rows = buildFlatRows(
    [group('g', [leaf('x'), leaf('y')]), leaf('a')],
    new Set(['g']),
  );
  const lastRow = rows[rows.length - 1]!; // 'x'
  const groupRow = rows.find((r) => r.obj.id === 'g')!;
  const rect = { top: 0, height: 20 };

  it('is true only below the last row', () => {
    expect(isPastListEnd(rows, lastRow, 25, rect)).toBe(true);
  });
  it('is false inside the last row', () => {
    expect(isPastListEnd(rows, lastRow, 10, rect)).toBe(false);
  });
  it('is false when the over-row is not the last row', () => {
    expect(isPastListEnd(rows, groupRow, 25, rect)).toBe(false);
  });
  it('is false without geometry', () => {
    expect(isPastListEnd(rows, lastRow, null, rect)).toBe(false);
    expect(isPastListEnd(rows, lastRow, 25, null)).toBe(false);
  });
});
