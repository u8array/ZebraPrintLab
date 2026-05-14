import { describe, it, expect, beforeEach } from 'vitest';
import { useLabelStore, currentObjects } from './labelStore';
import type { LabelObject } from '../registry';
import { isGroup } from '../types/Group';
import { defined, props } from '../test/helpers';

/** Reset store to clean state before each test. */
function reset() {
  useLabelStore.setState({
    label: { widthMm: 100, heightMm: 60, dpmm: 8 },
    pages: [{ objects: [] }],
    currentPageIndex: 0,
    selectedIds: [],
    clipboard: [],
    pasteCount: 0,
    canvasSettings: {
      showGrid: false,
      snapEnabled: false,
      snapSizeMm: 1,
      zoom: 1,
      unit: 'mm',
      viewRotation: 0,
    },
  });
}

function state() {
  return useLabelStore.getState();
}

function objs(): LabelObject[] {
  return currentObjects(state());
}

function ids() {
  return objs().map((o) => o.id);
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => reset());

// ── addObject ─────────────────────────────────────────────────────────────────

describe('addObject', () => {
  it('creates object with registry defaults and selects it', () => {
    state().addObject('text');
    expect(objs()).toHaveLength(1);
    const obj = defined(objs()[0]);
    expect(obj.type).toBe('text');
    expect(obj.x).toBe(50); // default position
    expect(obj.y).toBe(50);
    expect(obj.rotation).toBe(0);
    expect(props(obj)).toHaveProperty('content');
    expect(state().selectedIds).toEqual([obj.id]);
  });

  it('respects a custom position', () => {
    state().addObject('box', { x: 200, y: 300 });
    expect(defined(objs()[0]).x).toBe(200);
    expect(defined(objs()[0]).y).toBe(300);
  });

  it('ignores unknown types', () => {
    state().addObject('nonexistent_type_xyz');
    expect(objs()).toHaveLength(0);
  });

  it('gives each object a unique id', () => {
    state().addObject('text');
    state().addObject('text');
    const [a, b] = objs();
    expect(defined(a).id).not.toBe(defined(b).id);
  });
});

// ── updateObject (props merging) ──────────────────────────────────────────────

describe('updateObject — props merging', () => {
  it('merges partial props instead of replacing them', () => {
    state().addObject('text');
    const obj = defined(objs()[0]);
    state().updateObject(obj.id, { props: { fontHeight: 99 } });
    const updated = defined(objs()[0]);
    expect(props(updated).fontHeight).toBe(99);
    expect(props(updated).content).toBe('Text');
  });

  it('updates top-level fields (x, y) without touching props', () => {
    state().addObject('text');
    const obj = defined(objs()[0]);
    state().updateObject(obj.id, { x: 999 });
    expect(defined(objs()[0]).x).toBe(999);
    expect(props(defined(objs()[0])).content).toBe('Text');
  });
});

// ── removeObject ──────────────────────────────────────────────────────────────

describe('removeObject', () => {
  it('removes the object and deselects it', () => {
    state().addObject('text');
    const id = defined(objs()[0]).id;
    state().selectObject(id);
    state().removeObject(id);
    expect(objs()).toHaveLength(0);
    expect(state().selectedIds).toEqual([]);
  });
});

// ── locking ───────────────────────────────────────────────────────────────────

describe('lock', () => {
  it('blocks position changes on a locked object', () => {
    state().addObject('text', { x: 100, y: 100 });
    const id = defined(objs()[0]).id;
    state().updateObject(id, { locked: true });
    state().updateObject(id, { x: 999, y: 999 });
    expect(defined(objs()[0]).x).toBe(100);
    expect(defined(objs()[0]).y).toBe(100);
  });

  it('blocks prop changes on a locked object', () => {
    state().addObject('text');
    const id = defined(objs()[0]).id;
    state().updateObject(id, { locked: true });
    state().updateObject(id, { props: { fontHeight: 99 } });
    expect(props(defined(objs()[0])).fontHeight).not.toBe(99);
  });

  it('allows the lock itself to be toggled off', () => {
    state().addObject('text');
    const id = defined(objs()[0]).id;
    state().updateObject(id, { locked: true });
    state().updateObject(id, { locked: false });
    state().updateObject(id, { x: 500 });
    expect(defined(objs()[0]).x).toBe(500);
  });

  it('allows visibility, includeInExport and comment edits while locked', () => {
    state().addObject('text');
    const id = defined(objs()[0]).id;
    state().updateObject(id, { locked: true });
    state().updateObject(id, { visible: false });
    state().updateObject(id, { includeInExport: false });
    state().updateObject(id, { comment: 'note' });
    const o = defined(objs()[0]);
    expect(o.visible).toBe(false);
    expect(o.includeInExport).toBe(false);
    expect(o.comment).toBe('note');
  });

  it('protects locked objects from removeObject', () => {
    state().addObject('text');
    const id = defined(objs()[0]).id;
    state().updateObject(id, { locked: true });
    state().removeObject(id);
    expect(objs()).toHaveLength(1);
  });

  it('protects locked objects from removeSelectedObjects but removes unlocked siblings', () => {
    state().addObject('text', { x: 0, y: 0 });
    state().addObject('text', { x: 10, y: 10 });
    const lockedId = defined(objs()[0]).id;
    const otherId = defined(objs()[1]).id;
    state().updateObject(lockedId, { locked: true });
    state().selectObjects([lockedId, otherId]);
    state().removeSelectedObjects();
    expect(ids()).toEqual([lockedId]);
    expect(state().selectedIds).toEqual([lockedId]);
  });
});

// ── duplicateObject ───────────────────────────────────────────────────────────

describe('duplicateObject', () => {
  it('creates a copy offset by +20/+20 with a new id', () => {
    state().addObject('text', { x: 100, y: 100 });
    const original = defined(objs()[0]);
    state().duplicateObject(original.id);

    expect(objs()).toHaveLength(2);
    const copy = defined(objs()[1]);
    expect(copy.id).not.toBe(original.id);
    expect(copy.x).toBe(120);
    expect(copy.y).toBe(120);
    expect(copy.type).toBe('text');
  });

  it('selects only the new copy', () => {
    state().addObject('text');
    state().duplicateObject(defined(objs()[0]).id);
    expect(state().selectedIds).toHaveLength(1);
    expect(state().selectedIds[0]).toBe(defined(objs()[1]).id);
  });

  it('does nothing for a nonexistent id', () => {
    state().addObject('text');
    state().duplicateObject('fake-id');
    expect(objs()).toHaveLength(1);
  });
});

// ── duplicateSelectedObjects ──────────────────────────────────────────────────

describe('duplicateSelectedObjects', () => {
  it('staggers consecutive duplicates linearly (+20 from current selection)', () => {
    state().addObject('text', { x: 100, y: 100 });
    state().selectObject(defined(objs()[0]).id);

    state().duplicateSelectedObjects();
    state().duplicateSelectedObjects();
    state().duplicateSelectedObjects();

    expect(objs()).toHaveLength(4);
    // Selection follows the new copy each time, so the offsets compound
    // linearly: 100, 120, 140, 160 — never quadratic.
    expect(objs().map((o) => o.x)).toEqual([100, 120, 140, 160]);
    expect(objs().map((o) => o.y)).toEqual([100, 120, 140, 160]);
  });

  it('selects only the new copies', () => {
    state().addObject('text');
    state().addObject('text');
    state().selectObjects(objs().map((o) => o.id));

    state().duplicateSelectedObjects();

    expect(state().selectedIds).toHaveLength(2);
    expect(state().selectedIds).toEqual([objs()[2]!.id, objs()[3]!.id]);
  });

  it('is a no-op when nothing is selected', () => {
    state().addObject('text');
    state().selectObject(null);
    state().duplicateSelectedObjects();
    expect(objs()).toHaveLength(1);
  });
});

// ── copy / paste ──────────────────────────────────────────────────────────────

describe('copy / paste', () => {
  it('paste is a no-op when clipboard is empty', () => {
    state().pasteObjects();
    expect(objs()).toHaveLength(0);
  });

  it('paste increments offset with each call (+20, +40, …)', () => {
    state().addObject('text', { x: 100, y: 100 });
    state().selectObject(defined(objs()[0]).id);
    state().copySelectedObjects();

    state().pasteObjects();
    expect(objs()).toHaveLength(2);
    expect(defined(objs()[1]).x).toBe(120); // +20

    state().pasteObjects();
    expect(objs()).toHaveLength(3);
    expect(defined(objs()[2]).x).toBe(140); // +40
  });

  it('paste creates new ids (not reusing clipboard ids)', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().copySelectedObjects();
    state().pasteObjects();
    state().pasteObjects();
    const allIds = ids();
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

// ── selection ─────────────────────────────────────────────────────────────────

describe('toggleSelectObject', () => {
  it('adds to selection, then removes on second call', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();

    state().selectObject(null); // clear
    state().toggleSelectObject(defined(a).id);
    expect(state().selectedIds).toEqual([defined(a).id]);

    state().toggleSelectObject(defined(b).id);
    expect(state().selectedIds).toEqual([defined(a).id, defined(b).id]);

    state().toggleSelectObject(defined(a).id);
    expect(state().selectedIds).toEqual([defined(b).id]);
  });
});

describe('removeSelectedObjects', () => {
  it('removes all selected objects and clears selection', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    state().selectObjects(ids().slice(0, 2));

    state().removeSelectedObjects();
    expect(objs()).toHaveLength(1);
    expect(defined(objs()[0]).type).toBe('line');
    expect(state().selectedIds).toEqual([]);
  });
});

// ── reorder ───────────────────────────────────────────────────────────────────

describe('moveObjectToFront', () => {
  it('moves the object to the last position in the array', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    const first = defined(ids()[0]);

    state().moveObjectToFront(first);
    expect(ids()[2]).toBe(first);
  });

  it('is a no-op if already at the front', () => {
    state().addObject('text');
    state().addObject('box');
    const before = ids();
    state().moveObjectToFront(defined(before[1]));
    expect(ids()).toEqual(before);
  });
});

describe('moveObjectToBack', () => {
  it('moves the object to the first position', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    const last = defined(ids()[2]);

    state().moveObjectToBack(last);
    expect(ids()[0]).toBe(last);
  });

  it('is a no-op if already at the back', () => {
    state().addObject('text');
    state().addObject('box');
    const before = ids();
    state().moveObjectToBack(defined(before[0]));
    expect(ids()).toEqual(before);
  });
});

describe('moveObjectForward', () => {
  it('swaps with the next object', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    const [a, b, c] = ids();

    state().moveObjectForward(defined(a));
    expect(ids()).toEqual([b, a, c]);
  });
});

describe('moveObjectBackward', () => {
  it('swaps with the previous object', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    const [a, b, c] = ids();

    state().moveObjectBackward(defined(c));
    expect(ids()).toEqual([a, c, b]);
  });
});

describe('reorderObject', () => {
  it('moves an object to an arbitrary index', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('line');
    const [a, b, c] = ids();

    state().reorderObject(defined(c), 0);
    expect(ids()).toEqual([c, a, b]);
  });

  it('is a no-op when source equals target', () => {
    state().addObject('text');
    state().addObject('box');
    const before = ids();
    state().reorderObject(defined(before[1]), 1);
    expect(ids()).toEqual(before);
  });
});

// ── loadDesign ────────────────────────────────────────────────────────────────

describe('loadDesign', () => {
  it('replaces label config, pages, and clears selection', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);

    const newLabel = { widthMm: 50, heightMm: 30, dpmm: 12 };
    const newObjects = [
      { id: 'x1', type: 'box' as const, x: 10, y: 10, rotation: 0, props: { width: 50, height: 50, thickness: 3, filled: false, color: 'B' as const, rounding: 0 } },
    ] satisfies LabelObject[];

    state().loadDesign(newLabel, [{ objects: newObjects }]);
    expect(state().label).toEqual(newLabel);
    expect(state().pages).toHaveLength(1);
    expect(objs()).toHaveLength(1);
    expect(state().currentPageIndex).toBe(0);
    expect(state().selectedIds).toEqual([]);
  });

  it('falls back to a single empty page when given an empty pages array', () => {
    state().loadDesign({ widthMm: 50, heightMm: 30, dpmm: 8 }, []);
    expect(state().pages).toHaveLength(1);
    expect(objs()).toHaveLength(0);
    expect(state().currentPageIndex).toBe(0);
  });
});

// ── appendPages ───────────────────────────────────────────────────────────────

describe('appendPages', () => {
  const sampleObject: LabelObject = {
    id: 'imp1',
    type: 'box',
    x: 5,
    y: 5,
    rotation: 0,
    props: { width: 20, height: 20, thickness: 1, filled: false, color: 'B', rounding: 0 },
  };

  it('appends pages, keeps the existing label config, and focuses the first appended page', () => {
    state().addObject('text');
    const originalLabel = state().label;
    state().selectObject(defined(objs()[0]).id);

    state().appendPages([{ objects: [sampleObject] }, { objects: [] }]);

    expect(state().label).toEqual(originalLabel);
    expect(state().pages).toHaveLength(3);
    expect(state().currentPageIndex).toBe(1);
    expect(state().selectedIds).toEqual([]);
  });

  it('is a no-op when given an empty pages array', () => {
    state().addObject('text');
    const before = state().pages;
    state().appendPages([]);
    expect(state().pages).toBe(before);
  });
});

// ── setLabelConfig (partial merge) ────────────────────────────────────────────

describe('setLabelConfig', () => {
  it('merges partial config without losing other fields', () => {
    state().setLabelConfig({ widthMm: 200 });
    expect(state().label.widthMm).toBe(200);
    expect(state().label.heightMm).toBe(60); // unchanged
    expect(state().label.dpmm).toBe(8);      // unchanged
  });
});

// ── pages ─────────────────────────────────────────────────────────────────────

describe('addPage', () => {
  it('inserts a blank page after the current and switches to it', () => {
    expect(state().pages).toHaveLength(1);
    state().addPage();
    expect(state().pages).toHaveLength(2);
    expect(state().currentPageIndex).toBe(1);
    expect(objs()).toHaveLength(0);
  });

  it('clears selection when switching to the new page', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    expect(state().selectedIds).toHaveLength(1);
    state().addPage();
    expect(state().selectedIds).toEqual([]);
  });

  it('preserves objects on the previous page', () => {
    state().addObject('text');
    const firstPageObjId = defined(objs()[0]).id;
    state().addPage();
    expect(objs()).toHaveLength(0);
    state().setCurrentPage(0);
    expect(defined(objs()[0]).id).toBe(firstPageObjId);
  });

  it('inserts in the middle when current page is not the last', () => {
    state().addPage(); // pages [0, 1], current=1
    state().addPage(); // pages [0, 1, 2], current=2
    state().setCurrentPage(0);
    state().addPage(); // inserts at index 1, current=1
    expect(state().pages).toHaveLength(4);
    expect(state().currentPageIndex).toBe(1);
  });
});

describe('removePage', () => {
  it('refuses to remove the last remaining page', () => {
    state().removePage(0);
    expect(state().pages).toHaveLength(1);
  });

  it('removes the requested page and adjusts currentPageIndex when removing earlier page', () => {
    state().addPage(); // current=1
    state().addPage(); // current=2
    state().removePage(0);
    expect(state().pages).toHaveLength(2);
    expect(state().currentPageIndex).toBe(1);
  });

  it('clamps currentPageIndex when removing the current (last) page', () => {
    state().addPage(); // current=1
    state().removePage(1);
    expect(state().pages).toHaveLength(1);
    expect(state().currentPageIndex).toBe(0);
  });

  it('keeps currentPageIndex stable when removing a later page', () => {
    state().addPage(); // current=1
    state().addPage(); // current=2
    state().setCurrentPage(0);
    state().removePage(2);
    expect(state().pages).toHaveLength(2);
    expect(state().currentPageIndex).toBe(0);
  });

  it('ignores out-of-range indices', () => {
    state().addPage();
    const before = state().pages.length;
    state().removePage(99);
    expect(state().pages).toHaveLength(before);
  });
});

describe('duplicatePage', () => {
  it('clones the page at index with new object ids', () => {
    state().addObject('text');
    const originalId = defined(objs()[0]).id;
    state().duplicatePage(0);
    expect(state().pages).toHaveLength(2);
    expect(state().currentPageIndex).toBe(1);
    expect(objs()).toHaveLength(1);
    expect(defined(objs()[0]).id).not.toBe(originalId);
  });
});

describe('setCurrentPage', () => {
  it('switches pages and clears selection', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().addPage();
    expect(state().currentPageIndex).toBe(1);
    state().setCurrentPage(0);
    expect(state().currentPageIndex).toBe(0);
    expect(state().selectedIds).toEqual([]);
  });

  it('ignores out-of-range indices', () => {
    state().setCurrentPage(99);
    expect(state().currentPageIndex).toBe(0);
  });
});

describe('per-page object isolation', () => {
  it('addObject only affects the current page', () => {
    state().addObject('text');
    state().addPage();
    state().addObject('box');
    expect(objs()).toHaveLength(1);
    expect(defined(objs()[0]).type).toBe('box');
    state().setCurrentPage(0);
    expect(objs()).toHaveLength(1);
    expect(defined(objs()[0]).type).toBe('text');
  });

  it('paste targets the current page', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().copySelectedObjects();
    state().addPage();
    state().pasteObjects();
    expect(objs()).toHaveLength(1);
    state().setCurrentPage(0);
    expect(objs()).toHaveLength(1);
  });
});

// ── groupSelection / ungroup ──────────────────────────────────────────────────

describe('groupSelection', () => {
  it('wraps selected objects in a single group and selects it', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    expect(objs()).toHaveLength(1);
    const g = defined(objs()[0]);
    expect(isGroup(g)).toBe(true);
    if (isGroup(g)) expect(g.children).toHaveLength(2);
    expect(state().selectedIds).toEqual([g.id]);
  });

  it('inserts the group at the topmost selected position', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('circle');
    const [a, b, c] = objs();
    // Select first and second; group should land where the second one was.
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    expect(objs().map((o) => o.type)).toEqual(['group', 'circle']);
    expect(defined(objs()[1]).id).toBe(defined(c).id);
  });

  it('is a no-op with empty selection', () => {
    state().addObject('text');
    state().selectObject(null);
    state().groupSelection();
    expect(objs()).toHaveLength(1);
    expect(isGroup(defined(objs()[0]))).toBe(false);
  });

  it('skips locked objects', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().updateObject(defined(a).id, { locked: true });
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    // Only the box made it into a group; the locked text stayed at top level.
    const objects = objs();
    expect(objects).toHaveLength(2);
    const grp = objects.find((o) => isGroup(o));
    expect(grp).toBeDefined();
    if (grp && isGroup(grp)) {
      expect(grp.children).toHaveLength(1);
      expect(defined(grp.children[0]).type).toBe('box');
    }
  });

  it('allows grouping a single object (idiomatic in design tools)', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().groupSelection();
    expect(objs()).toHaveLength(1);
    expect(isGroup(defined(objs()[0]))).toBe(true);
  });
});

describe('updateObject — leaves inside groups', () => {
  it('reaches into a group to update a nested leaf', () => {
    state().addObject('text', { x: 10, y: 10 });
    state().addObject('box', { x: 50, y: 50 });
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    state().updateObject(defined(a).id, { x: 999 });
    // Group still at top level; updated leaf is found via tree walk.
    const grp = defined(objs()[0]);
    if (!isGroup(grp)) throw new Error('expected group');
    const updated = grp.children.find((c) => c.id === defined(a).id);
    expect(defined(updated).x).toBe(999);
  });

  it('keeps unrelated leaves and siblings unchanged', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    state().updateObject(defined(a).id, { x: 123 });
    const grp = defined(objs()[0]);
    if (!isGroup(grp)) throw new Error('expected group');
    const sibling = grp.children.find((c) => c.id === defined(b).id);
    expect(defined(sibling).x).toBe(50); // default position from addObject
  });
});

describe('ungroup', () => {
  it('replaces a selected group with its children at the same position', () => {
    state().addObject('text');
    state().addObject('box');
    state().addObject('circle');
    const [, b, c] = objs();
    state().selectObjects([defined(b).id, defined(c).id]);
    state().groupSelection();
    const groupId = defined(state().selectedIds[0]);
    state().selectObject(groupId);
    state().ungroup();
    expect(objs().map((o) => o.type)).toEqual(['text', 'box', 'circle']);
    // Selection follows the freed children.
    expect(state().selectedIds).toHaveLength(2);
  });

  it('is a no-op when no group is selected', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().ungroup();
    expect(objs()).toHaveLength(1);
    expect(isGroup(defined(objs()[0]))).toBe(false);
  });

  it('skips locked groups', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().groupSelection();
    const gid = defined(state().selectedIds[0]);
    state().updateObject(gid, { locked: true });
    state().ungroup();
    expect(objs()).toHaveLength(1);
    expect(isGroup(defined(objs()[0]))).toBe(true);
  });

  it('reparentObject moves a top-level leaf into a group', () => {
    state().addObject('text'); // a
    state().addObject('box');  // b
    state().addObject('circle'); // c
    const [a, b, c] = objs();
    // Group b and c
    state().selectObjects([defined(b).id, defined(c).id]);
    state().groupSelection();
    const gid = defined(state().selectedIds[0]);
    // Move 'a' into the group
    state().reparentObject(defined(a).id, { parentId: gid, index: 1 });
    expect(objs()).toHaveLength(1); // only the group at top level
    const grp = defined(objs()[0]);
    if (!isGroup(grp)) throw new Error('expected group');
    expect(grp.children.map((c) => c.id)).toEqual([
      defined(b).id, defined(a).id, defined(c).id,
    ]);
  });

  it('reparentObject moves a child out of a group to top level', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    const gid = defined(state().selectedIds[0]);
    // Extract 'a' to top level at index 0 (before the group)
    state().reparentObject(defined(a).id, { parentId: null, index: 0 });
    expect(objs()).toHaveLength(2);
    expect(defined(objs()[0]).id).toBe(defined(a).id);
    const grp = defined(objs()[1]);
    if (!isGroup(grp)) throw new Error('expected group');
    expect(grp.children.map((c) => c.id)).toEqual([defined(b).id]);
    expect(grp.id).toBe(gid);
  });

  it('reparentObject refuses to move a group into itself', () => {
    state().addObject('text');
    state().selectObject(defined(objs()[0]).id);
    state().groupSelection();
    const gid = defined(state().selectedIds[0]);
    const before = JSON.stringify(objs());
    state().reparentObject(gid, { parentId: gid, index: 0 });
    expect(JSON.stringify(objs())).toBe(before);
  });

  it('reparentObject refuses to move a group into one of its descendants', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    const outerGid = defined(state().selectedIds[0]);
    // Create an inner group containing only 'a' (manually via grouping
    // the existing children would need ungroup-then-group; this test
    // simulates the cycle case by trying to move outerGid into 'a'.)
    const before = JSON.stringify(objs());
    state().reparentObject(outerGid, { parentId: defined(a).id, index: 0 });
    // No-op because 'a' is a leaf, not a group → defensive check.
    expect(JSON.stringify(objs())).toBe(before);
  });

  it('addGroup appends an empty group and selects it', () => {
    state().addGroup();
    expect(objs()).toHaveLength(1);
    const g = defined(objs()[0]);
    expect(isGroup(g)).toBe(true);
    if (isGroup(g)) expect(g.children).toEqual([]);
    expect(state().selectedIds).toEqual([g.id]);
  });

  it('addGroup leaves existing top-level objects in place', () => {
    state().addObject('text');
    const textId = defined(objs()[0]).id;
    state().addGroup();
    expect(objs()).toHaveLength(2);
    // Group is appended at the end of the array = topmost in display.
    expect(defined(objs()[0]).id).toBe(textId);
    expect(isGroup(defined(objs()[1]))).toBe(true);
  });

  it('ungroupIds operates on the passed list, not the current selection', () => {
    state().addObject('text');
    state().addObject('box');
    const [a, b] = objs();
    state().selectObjects([defined(a).id, defined(b).id]);
    state().groupSelection();
    const gid = defined(state().selectedIds[0]);
    // Move selection elsewhere; the layers-panel button calls ungroupIds
    // without changing what the user has selected.
    state().selectObject(null);
    state().ungroupIds([gid]);
    expect(objs()).toHaveLength(2);
    expect(objs().every((o) => !isGroup(o))).toBe(true);
  });
});
