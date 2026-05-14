import { describe, it, expect } from 'vitest';
import {
  isGroup,
  walkObjects,
  getAllLeaves,
  findObjectById,
  findAncestors,
  selectionTargetId,
  expandSelection,
  type GroupObject,
} from './Group';
import type { LabelObject } from '../registry';

function leaf(id: string): LabelObject {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    rotation: 0,
    props: { text: '', fontHeight: 20, font: '0', interpretation: false },
  } as LabelObject;
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
