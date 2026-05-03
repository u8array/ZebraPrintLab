import { describe, it, expect, beforeEach } from 'vitest';
import { useLabelStore, currentObjects } from './labelStore';
import type { LabelObject } from '../registry';
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
    duplicateCount: 0,
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
    expect(obj.props).toHaveProperty('content');
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
