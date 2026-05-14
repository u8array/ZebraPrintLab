import { describe, it, expect } from 'vitest';
import {
  isGroup,
  walkObjects,
  getAllLeaves,
  findObjectById,
  findAncestors,
  selectionTargetId,
  expandSelection,
  detachObjectById,
  isSelfOrDescendant,
  canGroupSelection,
  mapObjectById,
  type GroupObject,
} from './Group';
import type { LabelObject } from '../registry';

function leaf(id: string): LabelObject {
  // The tree helpers under test only inspect id / type / children, never
  // type-specific props. Cast through unknown so the test fixture can
  // stay minimal instead of carrying a full TextProps shape.
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    rotation: 0,
    props: { text: '', fontHeight: 20, font: '0', interpretation: false },
  } as unknown as LabelObject;
}

function group(id: string, children: LabelObject[]): GroupObject {
  return { id, type: 'group', x: 0, y: 0, rotation: 0, children };
}

describe('Group helpers', () => {
  describe('isGroup', () => {
    it('discriminates leaves from groups', () => {
      expect(isGroup(leaf('a'))).toBe(false);
      expect(isGroup(group('g', []))).toBe(true);
    });
  });

  describe('walkObjects', () => {
    it('yields nodes depth-first, parent before children', () => {
      const tree: LabelObject[] = [
        leaf('a'),
        group('g1', [leaf('b'), group('g2', [leaf('c')]), leaf('d')]),
        leaf('e'),
      ];
      const ids = [...walkObjects(tree)].map((o) => o.id);
      expect(ids).toEqual(['a', 'g1', 'b', 'g2', 'c', 'd', 'e']);
    });

    it('handles empty input', () => {
      expect([...walkObjects([])]).toEqual([]);
    });
  });

  describe('getAllLeaves', () => {
    it('returns only leaves, skipping group nodes', () => {
      const tree: LabelObject[] = [
        leaf('a'),
        group('g1', [leaf('b'), group('g2', [leaf('c')])]),
      ];
      expect(getAllLeaves(tree).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty for a tree of only empty groups', () => {
      expect(getAllLeaves([group('g', [group('g2', [])])])).toEqual([]);
    });
  });

  describe('findObjectById', () => {
    it('finds top-level leaves', () => {
      expect(findObjectById([leaf('a')], 'a')?.id).toBe('a');
    });

    it('finds nested leaves', () => {
      const tree = [group('g', [group('g2', [leaf('deep')])])];
      expect(findObjectById(tree, 'deep')?.id).toBe('deep');
    });

    it('finds groups themselves', () => {
      const tree = [group('g', [leaf('child')])];
      expect(findObjectById(tree, 'g')?.type).toBe('group');
    });

    it('returns undefined for missing ids', () => {
      expect(findObjectById([leaf('a')], 'missing')).toBeUndefined();
    });
  });

  describe('findAncestors', () => {
    it('returns empty for top-level objects', () => {
      expect(findAncestors([leaf('a')], 'a')).toEqual([]);
    });

    it('returns the group chain outermost first', () => {
      const inner = group('g2', [leaf('deep')]);
      const outer = group('g1', [inner]);
      const tree = [outer];
      const ancestors = findAncestors(tree, 'deep');
      expect(ancestors.map((g) => g.id)).toEqual(['g1', 'g2']);
    });

    it('returns empty for missing ids', () => {
      expect(findAncestors([leaf('a')], 'missing')).toEqual([]);
    });
  });

  describe('selectionTargetId', () => {
    it('passes top-level leaves through unchanged', () => {
      expect(selectionTargetId([leaf('a')], 'a')).toBe('a');
    });

    it('promotes a clicked child to its outermost group', () => {
      const tree = [group('g1', [group('g2', [leaf('deep')])])];
      expect(selectionTargetId(tree, 'deep')).toBe('g1');
    });

    it('returns the id itself when not found (no surprises for callers)', () => {
      expect(selectionTargetId([leaf('a')], 'missing')).toBe('missing');
    });
  });

  describe('detachObjectById', () => {
    it('removes a top-level leaf', () => {
      const tree = [leaf('a'), leaf('b')];
      const { removed, rest } = detachObjectById(tree, 'a');
      expect(removed?.id).toBe('a');
      expect(rest.map((o) => o.id)).toEqual(['b']);
    });

    it('removes a nested leaf and rebuilds the parent group', () => {
      const tree = [group('g', [leaf('a'), leaf('b')])];
      const { removed, rest } = detachObjectById(tree, 'a');
      expect(removed?.id).toBe('a');
      const grp = rest[0];
      expect(grp && isGroup(grp) ? grp.children.map((c) => c.id) : null).toEqual(['b']);
    });

    it('removes a whole group node', () => {
      const tree = [leaf('a'), group('g', [leaf('x')])];
      const { removed, rest } = detachObjectById(tree, 'g');
      expect(removed?.id).toBe('g');
      expect(rest.map((o) => o.id)).toEqual(['a']);
    });

    it('returns null and the original tree when id is unknown', () => {
      const tree = [leaf('a')];
      const { removed, rest } = detachObjectById(tree, 'missing');
      expect(removed).toBeNull();
      expect(rest.map((o) => o.id)).toEqual(['a']);
    });
  });

  describe('isSelfOrDescendant', () => {
    it('identifies the node itself', () => {
      expect(isSelfOrDescendant([leaf('a')], 'a', 'a')).toBe(true);
    });

    it('identifies a descendant of a group', () => {
      const tree = [group('g', [group('inner', [leaf('deep')])])];
      expect(isSelfOrDescendant(tree, 'g', 'deep')).toBe(true);
      expect(isSelfOrDescendant(tree, 'g', 'inner')).toBe(true);
    });

    it('returns false for unrelated nodes', () => {
      const tree = [group('g1', [leaf('a')]), group('g2', [leaf('b')])];
      expect(isSelfOrDescendant(tree, 'g1', 'b')).toBe(false);
    });

    it('returns false when the root id is missing', () => {
      expect(isSelfOrDescendant([leaf('a')], 'missing', 'a')).toBe(false);
    });
  });

  describe('canGroupSelection', () => {
    it('returns true when at least one top-level unlocked item is selected', () => {
      expect(canGroupSelection([leaf('a'), leaf('b')], ['a'])).toBe(true);
    });

    it('returns false for an empty selection', () => {
      expect(canGroupSelection([leaf('a')], [])).toBe(false);
    });

    it('ignores nested ids (only top-level counts)', () => {
      const tree = [group('g', [leaf('inside')])];
      expect(canGroupSelection(tree, ['inside'])).toBe(false);
    });

    it('ignores locked top-level items', () => {
      const locked = { ...leaf('a'), locked: true };
      expect(canGroupSelection([locked], ['a'])).toBe(false);
    });

    it('returns true when one of several selected items is groupable', () => {
      const locked = { ...leaf('a'), locked: true };
      expect(canGroupSelection([locked, leaf('b')], ['a', 'b'])).toBe(true);
    });
  });

  describe('mapObjectById', () => {
    it('applies the mapper to the matching node', () => {
      const tree = [leaf('a'), leaf('b')];
      const next = mapObjectById(tree, 'a', (o) => ({ ...o, x: 99 }));
      expect(next[0]?.x).toBe(99);
      expect(next[1]).toBe(tree[1]); // sibling unchanged
    });

    it('preserves the top-level array reference when no id matches', () => {
      const tree = [leaf('a'), leaf('b')];
      const next = mapObjectById(tree, 'missing', (o) => ({ ...o, x: 99 }));
      expect(next).toBe(tree);
    });

    it('preserves untouched group subtrees by reference', () => {
      const inner = leaf('inside');
      const tree = [group('g1', [inner]), group('g2', [leaf('other')])];
      const next = mapObjectById(tree, 'inside', (o) => ({ ...o, x: 5 }));
      // g2 wasn't touched — its node identity stays.
      expect(next[1]).toBe(tree[1]);
      // g1 is rebuilt (its children array changed), but the unchanged
      // sibling inside g1 — there's none — would also keep identity.
      expect(next[0]).not.toBe(tree[0]);
    });

    it('preserves the array reference when the mapper returns the same node', () => {
      const tree = [leaf('a')];
      const next = mapObjectById(tree, 'a', (o) => o);
      expect(next).toBe(tree);
    });
  });

  describe('expandSelection', () => {
    it('passes leaf ids through unchanged', () => {
      expect(expandSelection([leaf('a'), leaf('b')], ['a'])).toEqual(['a']);
    });

    it('expands a group id to its leaf descendants', () => {
      const tree = [group('g', [leaf('x'), leaf('y')])];
      expect(expandSelection(tree, ['g'])).toEqual(['x', 'y']);
    });

    it('expands nested groups depth-first', () => {
      const tree = [group('g', [leaf('a'), group('inner', [leaf('b')])])];
      expect(expandSelection(tree, ['g'])).toEqual(['a', 'b']);
    });

    it('handles mixed leaf + group selection', () => {
      const tree: ReturnType<typeof leaf | typeof group>[] = [
        leaf('a'),
        group('g', [leaf('b'), leaf('c')]),
      ];
      expect(expandSelection(tree, ['a', 'g'])).toEqual(['a', 'b', 'c']);
    });

    it('silently drops unknown ids', () => {
      expect(expandSelection([leaf('a')], ['missing'])).toEqual([]);
    });
  });
});
