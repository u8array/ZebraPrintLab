import { describe, it, expect } from 'vitest';
import { buildBulkToggleUpdates } from './bulkToggle';

describe('buildBulkToggleUpdates', () => {
  describe('lock', () => {
    it('flips a single unlocked row to locked', () => {
      const updates = buildBulkToggleUpdates(
        [{ id: 'a' }],
        [],
        'a',
        'locked',
      );
      expect(updates).toEqual([{ id: 'a', changes: { locked: true } }]);
    });

    it('flips a single locked row back to its default state (undefined)', () => {
      // Default-state values persist as `undefined` to match the
      // PropertiesPanel checkbox pattern and keep saved JSON free of
      // boilerplate `locked: false` keys.
      const updates = buildBulkToggleUpdates(
        [{ id: 'a', locked: true }],
        [],
        'a',
        'locked',
      );
      expect(updates).toEqual([{ id: 'a', changes: { locked: undefined } }]);
    });

    it('broadcasts the clicked row state to the whole selection', () => {
      const updates = buildBulkToggleUpdates(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        ['a', 'b', 'c'],
        'a',
        'locked',
      );
      expect(updates).toEqual([
        { id: 'a', changes: { locked: true } },
        { id: 'b', changes: { locked: true } },
        { id: 'c', changes: { locked: true } },
      ]);
    });

    it('converges a mixed-state selection on the flipped value of the clicked row', () => {
      // Clicked row is unlocked → next = locked → every selected row goes
      // to locked, including ones that were already locked.
      const updates = buildBulkToggleUpdates(
        [
          { id: 'a' },              // unlocked → clicked
          { id: 'b', locked: true },
          { id: 'c' },
        ],
        ['a', 'b', 'c'],
        'a',
        'locked',
      );
      expect(updates).toEqual([
        { id: 'a', changes: { locked: true } },
        { id: 'b', changes: { locked: true } },
        { id: 'c', changes: { locked: true } },
      ]);
    });

    it('targets only the clicked row when it is not part of the selection', () => {
      const updates = buildBulkToggleUpdates(
        [{ id: 'a' }, { id: 'b' }],
        ['b'],
        'a',
        'locked',
      );
      expect(updates).toEqual([{ id: 'a', changes: { locked: true } }]);
    });
  });

  describe('visible', () => {
    it('treats undefined visible as on, so the first toggle hides', () => {
      const updates = buildBulkToggleUpdates(
        [{ id: 'a' }],
        [],
        'a',
        'visible',
      );
      expect(updates).toEqual([{ id: 'a', changes: { visible: false } }]);
    });

    it('flips a hidden row back to its default state (undefined)', () => {
      const updates = buildBulkToggleUpdates(
        [{ id: 'a', visible: false }],
        [],
        'a',
        'visible',
      );
      expect(updates).toEqual([{ id: 'a', changes: { visible: undefined } }]);
    });
  });

  it('returns empty when the clicked id is unknown', () => {
    expect(buildBulkToggleUpdates([{ id: 'a' }], ['a'], 'missing', 'locked')).toEqual([]);
  });
});
