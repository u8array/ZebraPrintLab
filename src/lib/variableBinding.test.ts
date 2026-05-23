import { describe, it, expect } from 'vitest';
import {
  resolveVariableValue,
  buildActiveCsvRow,
  applyBindingToObject,
  applyBindingToTree,
  getVariableSource,
  type ActiveCsvRow,
} from './variableBinding';
import type { CsvMapping, Variable } from '../types/Variable';
import type { LabelObject } from '../types/Group';

const variable = (over: Partial<Variable> = {}): Variable => ({
  id: 'v1',
  name: 'sku',
  fnNumber: 1,
  defaultValue: 'DEFAULT',
  ...over,
});

const mapping = (bindings: Record<string, string> = {}): CsvMapping => ({
  bindings,
  headerSnapshot: [],
});

const active = (
  headers: string[],
  row: string[],
  bindings: Record<string, string>,
): ActiveCsvRow => ({ headers, row, mapping: mapping(bindings) });

describe('resolveVariableValue', () => {
  it('returns defaultValue when no active row', () => {
    expect(resolveVariableValue(variable(), null)).toBe('DEFAULT');
  });

  it('returns defaultValue when variable is not bound', () => {
    expect(
      resolveVariableValue(variable(), active(['sku'], ['A1'], { other: 'sku' })),
    ).toBe('DEFAULT');
  });

  it('returns the bound cell value when header exists', () => {
    expect(
      resolveVariableValue(
        variable(),
        active(['sku', 'qty'], ['A1', '10'], { v1: 'sku' }),
      ),
    ).toBe('A1');
  });

  it('returns defaultValue when bound header is missing from headers', () => {
    expect(
      resolveVariableValue(
        variable(),
        active(['qty'], ['10'], { v1: 'sku' }),
      ),
    ).toBe('DEFAULT');
  });

  it('returns empty string for an empty cell (no fallback to default)', () => {
    expect(
      resolveVariableValue(
        variable(),
        active(['sku'], [''], { v1: 'sku' }),
      ),
    ).toBe('');
  });

  it('returns empty string when row is shorter than headers', () => {
    expect(
      resolveVariableValue(
        variable(),
        active(['sku', 'qty'], ['A1'], { v1: 'qty' }),
      ),
    ).toBe('');
  });

  it('schema mode returns «name» regardless of CSV state', () => {
    expect(resolveVariableValue(variable({ name: 'sku' }), null, 'schema')).toBe('«sku»');
    expect(
      resolveVariableValue(
        variable({ name: 'sku' }),
        active(['sku'], ['A1'], { v1: 'sku' }),
        'schema',
      ),
    ).toBe('«sku»');
  });
});

describe('buildActiveCsvRow', () => {
  it('returns null when dataset is null', () => {
    expect(buildActiveCsvRow(null, mapping())).toBeNull();
  });

  it('returns null when mapping is null', () => {
    expect(
      buildActiveCsvRow(
        { headers: ['sku'], rows: [['A1']], activeRowIndex: 0 },
        null,
      ),
    ).toBeNull();
  });

  it('returns null when activeRowIndex is out of bounds', () => {
    expect(
      buildActiveCsvRow(
        { headers: ['sku'], rows: [], activeRowIndex: 0 },
        mapping(),
      ),
    ).toBeNull();
  });

  it('assembles row when dataset, mapping and index align', () => {
    const result = buildActiveCsvRow(
      { headers: ['sku', 'qty'], rows: [['A1', '10'], ['B2', '5']], activeRowIndex: 1 },
      mapping({ v1: 'sku' }),
    );
    expect(result).toEqual({
      headers: ['sku', 'qty'],
      row: ['B2', '5'],
      mapping: mapping({ v1: 'sku' }),
    });
  });
});

describe('applyBindingToObject', () => {
  const obj = (variableId?: string, content = 'orig'): LabelObject =>
    ({
      id: 'o1',
      type: 'text',
      x: 0,
      y: 0,
      rotation: 0,
      ...(variableId ? { variableId } : {}),
      props: { content },
    }) as unknown as LabelObject;

  it('returns identity when object has no variableId', () => {
    const o = obj();
    expect(applyBindingToObject(o, [variable()])).toBe(o);
  });

  it('substitutes defaultValue when no active row', () => {
    const o = obj('v1');
    const out = applyBindingToObject(o, [variable()]);
    expect((out as unknown as { props: { content: string } }).props.content).toBe(
      'DEFAULT',
    );
  });

  it('substitutes CSV cell when bound and row is active', () => {
    const o = obj('v1');
    const out = applyBindingToObject(
      o,
      [variable()],
      active(['sku'], ['A1'], { v1: 'sku' }),
    );
    expect((out as unknown as { props: { content: string } }).props.content).toBe(
      'A1',
    );
  });

  it('returns identity when resolved value already matches', () => {
    const o = obj('v1', 'DEFAULT');
    expect(applyBindingToObject(o, [variable()])).toBe(o);
  });
});

describe('getVariableSource', () => {
  const v = variable();
  const datasetWith = (headers: string[]) => ({ headers });

  it("returns 'default' when no mapping exists", () => {
    expect(getVariableSource(v, datasetWith(['sku']), null)).toBe('default');
  });

  it("returns 'default' when variable is not in mapping bindings", () => {
    expect(
      getVariableSource(v, datasetWith(['sku']), { bindings: {}, headerSnapshot: ['sku'] }),
    ).toBe('default');
  });

  it("returns 'default' when bound but no dataset is loaded", () => {
    expect(
      getVariableSource(v, null, { bindings: { v1: 'sku' }, headerSnapshot: ['sku'] }),
    ).toBe('default');
  });

  it("returns 'csv' when bound and the header exists in the dataset", () => {
    expect(
      getVariableSource(v, datasetWith(['sku', 'qty']), {
        bindings: { v1: 'sku' },
        headerSnapshot: ['sku', 'qty'],
      }),
    ).toBe('csv');
  });

  it("returns 'orphan' when bound but header is missing from current dataset", () => {
    expect(
      getVariableSource(v, datasetWith(['qty']), {
        bindings: { v1: 'sku' },
        headerSnapshot: ['sku', 'qty'],
      }),
    ).toBe('orphan');
  });
});

describe('applyBindingToTree', () => {
  const leaf = (id: string, variableId?: string, content = 'orig'): LabelObject =>
    ({
      id,
      type: 'text',
      x: 0,
      y: 0,
      rotation: 0,
      ...(variableId ? { variableId } : {}),
      props: { content },
    }) as unknown as LabelObject;

  const group = (id: string, children: LabelObject[]): LabelObject =>
    ({
      id,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      children,
    }) as unknown as LabelObject;

  it('substitutes top-level leaves', () => {
    const objs = [leaf('a'), leaf('b', 'v1')];
    const out = applyBindingToTree(objs, [variable()], null);
    expect((out[1] as unknown as { props: { content: string } }).props.content).toBe('DEFAULT');
  });

  it('recurses into group children', () => {
    const objs = [group('g1', [leaf('a', 'v1'), leaf('b')])];
    const out = applyBindingToTree(objs, [variable()], null);
    const g = out[0]! as unknown as { children: { props: { content: string } }[] };
    expect(g.children[0]!.props.content).toBe('DEFAULT');
    expect(g.children[1]!.props.content).toBe('orig');
  });

  it('substitutes from active CSV row', () => {
    const objs = [leaf('a', 'v1')];
    const out = applyBindingToTree(
      objs,
      [variable()],
      active(['sku'], ['ROW-VALUE'], { v1: 'sku' }),
    );
    expect((out[0] as unknown as { props: { content: string } }).props.content).toBe('ROW-VALUE');
  });

  it('schema mode replaces with «name» across tree', () => {
    const objs = [group('g1', [leaf('a', 'v1')])];
    const out = applyBindingToTree(objs, [variable({ name: 'sku' })], null, 'schema');
    const g = out[0]! as unknown as { children: { props: { content: string } }[] };
    expect(g.children[0]!.props.content).toBe('«sku»');
  });
});
