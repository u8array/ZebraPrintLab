import { describe, it, expect } from 'vitest';
import { parseDesignFile, serializeDesign } from './designFile';
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

  it('migrates legacy { label, objects } shape into a single page', () => {
    const legacyJson = JSON.stringify({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: SAMPLE_OBJECTS,
    });
    const result = parseDesignFile(legacyJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages).toHaveLength(1);
    expect(result.value.pages[0]?.objects).toHaveLength(1);
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

  it('legacy { label, objects } shape loads with empty variables', () => {
    const legacyJson = JSON.stringify({
      label: { widthMm: 100, heightMm: 60, dpmm: 8 },
      objects: SAMPLE_OBJECTS,
    });
    const result = parseDesignFile(legacyJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variables).toEqual([]);
  });
});
