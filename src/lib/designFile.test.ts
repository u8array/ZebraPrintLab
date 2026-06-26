import { describe, it, expect } from 'vitest';
import { parseDesignFile, serializeDesign, CURRENT_DESIGN_SCHEMA_VERSION } from './designFile';
import type { LabelObject } from '../types/Group';
import type { Variable } from '../types/Variable';

const SAMPLE_OBJECTS: LabelObject[] = [
  {
    id: 'obj-1',
    type: 'box',
    x: 10,
    y: 10,
    rotation: 0,
    props: { width: 50, height: 30, thickness: 2, filled: false, color: 'B', rounding: 0 },
  },
];

describe('serializeDesign', () => {
  it('emits the new pages-shaped JSON', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
    );
    const parsed = JSON.parse(json) as { pages: { objects: LabelObject[] }[] };
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0]?.objects).toHaveLength(1);
  });

  it('writes the current schemaVersion field', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
    );
    const parsed = JSON.parse(json) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(CURRENT_DESIGN_SCHEMA_VERSION);
  });

  it('serializes multiple pages', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }, { objects: [] }],
    );
    const parsed = JSON.parse(json) as { pages: unknown[] };
    expect(parsed.pages).toHaveLength(2);
  });
});

describe('parseDesignFile', () => {
  it('parses the new pages-shaped JSON', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages).toHaveLength(1);
    expect(result.value.pages[0]?.objects).toHaveLength(1);
  });

  it('v1->v2: gives a legacy reverse text a black backing object', () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: 't',
              type: 'text',
              x: 50,
              y: 50,
              rotation: 0,
              props: { content: 'Hi', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true },
            },
          ],
        },
      ],
    });
    const result = parseDesignFile(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const objs = result.value.pages[0]?.objects ?? [];
    expect(objs).toHaveLength(2); // backing inserted before the text
    expect(['box', 'line']).toContain(objs[0]?.type);
    expect(objs[1]?.type).toBe('text');
  });

  it('v1->v2: drops the overlay on a page that gains a reverse backing', () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: 't',
              type: 'text',
              x: 50,
              y: 50,
              rotation: 0,
              props: { content: 'Hi', fontHeight: 30, fontWidth: 0, rotation: 'N', reverse: true },
            },
          ],
          overlay: {
            segments: [{ kind: 'raw', text: '^XA^FR^FDHi^FS^XZ' }],
            v: 3,
            regenSafe: true,
          },
        },
      ],
    });
    const result = parseDesignFile(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.value.pages[0];
    expect(page?.objects).toHaveLength(2); // backing inserted
    expect(page?.overlay).toBeUndefined(); // stale overlay dropped
  });

  it('v1->v2: keeps the overlay on a page with no reverse text', () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: SAMPLE_OBJECTS,
          overlay: {
            segments: [{ kind: 'raw', text: '^XA^FO10,10^FDx^FS^XZ' }],
            v: 3,
            regenSafe: true,
          },
        },
      ],
    });
    const result = parseDesignFile(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages[0]?.overlay).toBeDefined();
  });

  it('round-trips a page overlay through serialize + parse', () => {
    const source = '^XA^FO10,10^FDx^FS^XZ';
    const overlay = {
      segments: [
        { kind: 'raw' as const, text: '^XA' },
        { kind: 'object' as const, objectId: 'obj-1', text: '^FO10,10^FDx^FS' },
        { kind: 'raw' as const, text: '^XZ' },
      ],
      v: 3,
      regenSafe: true,
    };
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS, overlay }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loaded = result.value.pages[0]?.overlay;
    expect(loaded?.segments).toHaveLength(3);
    expect(loaded?.segments.map((s) => s.text).join('')).toBe(source);
  });

  it('drops a stale-version overlay (keeps the page)', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{
        objects: SAMPLE_OBJECTS,
        overlay: {
          segments: [{ kind: 'raw', text: '^XA^FDx^FS^XZ' }],
          v: 1,
          regenSafe: true,
        },
      }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Page still loads; only the stale overlay is dropped.
    expect(result.value.pages).toHaveLength(1);
    expect(result.value.pages[0]?.overlay).toBeUndefined();
  });

  it('rejects files without a schemaVersion field', () => {
    const json = JSON.stringify({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [{ objects: SAMPLE_OBJECTS }],
    });
    const result = parseDesignFile(json);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_schema');
  });

  it('migrates legacy gs1databar inside a nested group', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: 'g',
              type: 'group',
              x: 0,
              y: 0,
              rotation: 0,
              children: [
                {
                  id: 'g1',
                  type: 'gs1databar',
                  x: 0,
                  y: 0,
                  rotation: 0,
                  props: { content: '0112345678901', moduleWidth: 5, symbology: 1, rotation: 'N' },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = parseDesignFile(legacyJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const group = result.value.pages[0]?.objects[0] as { children?: unknown[] };
    const child = group.children?.[0] as { props: Record<string, unknown> };
    expect(child.props.magnification).toBe(5);
    expect(child.props.moduleWidth).toBeUndefined();
  });

  it('gs1databar migration is idempotent and prefers existing magnification', () => {
    // A re-saved file may already carry both keys; the migration must
    // leave the new key intact and not overwrite it from the legacy slot.
    const mixed = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: 'g1',
              type: 'gs1databar',
              x: 0,
              y: 0,
              rotation: 0,
              props: { content: '01', moduleWidth: 9, magnification: 4, symbology: 1, rotation: 'N' },
            },
          ],
        },
      ],
    });
    const result = parseDesignFile(mixed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const obj = result.value.pages[0]?.objects[0] as unknown as { props: Record<string, unknown> };
    expect(obj.props.magnification).toBe(4);
    expect(obj.props.moduleWidth).toBe(9); // untouched when magnification already present
  });

  it('migrates legacy gs1databar props.moduleWidth → props.magnification', () => {
    const legacyJson = JSON.stringify({
      schemaVersion: 1,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [
            {
              id: 'g1',
              type: 'gs1databar',
              x: 0,
              y: 0,
              rotation: 0,
              props: { content: '0112345678901', moduleWidth: 4, symbology: 1, rotation: 'N' },
            },
          ],
        },
      ],
    });
    const result = parseDesignFile(legacyJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const obj = result.value.pages[0]?.objects[0];
    expect(obj?.type).toBe('gs1databar');
    const p = (obj as unknown as { props: Record<string, unknown> }).props;
    expect(p.magnification).toBe(4);
    expect(p.moduleWidth).toBeUndefined();
  });

  it('rejects an unknown schemaVersion as invalid_schema', () => {
    const futureJson = JSON.stringify({
      schemaVersion: 999,
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [{ objects: SAMPLE_OBJECTS }],
    });
    const result = parseDesignFile(futureJson);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_schema');
  });

  it('returns parse_error for invalid JSON', () => {
    const result = parseDesignFile('not json {');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('parse_error');
  });

  it('returns invalid_schema for JSON that matches no shape', () => {
    const result = parseDesignFile('{"foo": "bar"}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_schema');
  });

  it('roundtrips through serialize/parse without loss', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }, { objects: SAMPLE_OBJECTS }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages).toHaveLength(2);
    expect(result.value.pages[0]?.objects).toHaveLength(1);
    expect(result.value.pages[1]?.objects).toHaveLength(1);
  });

  it('roundtrips a design containing nested groups without structural loss', () => {
    const designWithGroups: LabelObject[] = [
      SAMPLE_OBJECTS[0]!,
      {
        id: 'grp-outer',
        type: 'group',
        x: 0,
        y: 0,
        rotation: 0,
        name: 'Header',
        children: [
          {
            id: 'grp-inner',
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            children: [
              {
                id: 'obj-2',
                type: 'box',
                x: 5,
                y: 5,
                rotation: 0,
                props: { width: 20, height: 10, thickness: 1, filled: true, color: 'B', rounding: 0 },
              },
            ],
          } as LabelObject,
        ],
      } as LabelObject,
    ];
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: designWithGroups }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages[0]?.objects).toEqual(designWithGroups);
  });

  it('rejects a leaf object that is missing its props', () => {
    const malformed = JSON.stringify({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [{ id: 'a', type: 'box', x: 0, y: 0, rotation: 0 }],
        },
      ],
    });
    const result = parseDesignFile(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_schema');
  });

  it('rejects a group object that is missing its children', () => {
    const malformed = JSON.stringify({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      pages: [
        {
          objects: [{ id: 'g', type: 'group', x: 0, y: 0, rotation: 0 }],
        },
      ],
    });
    const result = parseDesignFile(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_schema');
  });

  it('roundtrips variables when present', () => {
    const variables: Variable[] = [
      { id: 'v1', name: 'sku', fnNumber: 1, defaultValue: 'ABC' },
      { id: 'v2', name: 'qty', fnNumber: 2, defaultValue: '0', comment: 'Quantity' },
    ];
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
      variables,
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variables).toEqual(variables);
  });

  it('omits the variables key from JSON when empty (back-compat with older app versions)', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
      [],
    );
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('variables');
  });

  it('defaults to empty variables when the JSON lacks the field', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variables).toEqual([]);
  });

  it('roundtrips csvMapping when present', () => {
    const mapping = {
      bindings: { v1: 'SKU', v2: 'Quantity' },
      headerSnapshot: ['SKU', 'Quantity', 'Notes'],
    };
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
      [],
      mapping,
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.csvMapping).toEqual(mapping);
  });

  it('omits csvMapping from JSON when null (back-compat)', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
      [],
      null,
    );
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('csvMapping');
  });

  it('defaults to null csvMapping when JSON lacks the field', () => {
    const json = serializeDesign(
      { widthMm: 100, heightMm: 60, dpmm: 8 },
      [{ objects: SAMPLE_OBJECTS }],
    );
    const result = parseDesignFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.csvMapping).toBeNull();
  });
});
