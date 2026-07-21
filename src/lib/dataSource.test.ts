import { describe, it, expect } from 'vitest';
import {
  datasetDisplayName,
  datasetTimestamp,
  type DatasetSource,
} from '@zplab/core/types/DataSource';

const csv: DatasetSource = {
  kind: 'csv',
  filename: 'items.csv',
  importedAt: '2026-07-20T10:00:00.000Z',
  encoding: 'utf-8',
  delimiter: ',',
  rowCount: 3,
};
const db: DatasetSource = {
  kind: 'db',
  profileId: 'p1',
  profileName: 'Prod',
  table: 'items',
  fetchedAt: '2026-07-20T11:00:00.000Z',
  rowCount: 3,
  truncated: false,
};
const excel: DatasetSource = {
  kind: 'excel',
  filename: 'stock.xlsx',
  sheet: 'Sheet1',
  importedAt: '2026-07-20T12:00:00.000Z',
  rowCount: 3,
  truncated: false,
};

describe('datasetDisplayName', () => {
  it('names each source kind distinctly', () => {
    expect(datasetDisplayName(csv)).toBe('items.csv');
    expect(datasetDisplayName(db)).toBe('Prod · items');
    expect(datasetDisplayName(excel)).toBe('stock.xlsx · Sheet1');
  });
});

describe('datasetTimestamp', () => {
  it('uses fetchedAt for db and importedAt for file sources', () => {
    expect(datasetTimestamp(db)).toBe(db.fetchedAt);
    expect(datasetTimestamp(csv)).toBe(csv.importedAt);
    expect(datasetTimestamp(excel)).toBe(excel.importedAt);
  });
});
