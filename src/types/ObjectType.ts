import type React from 'react';

export interface LabelConfig {
  widthMm: number;
  heightMm: number;
  dpmm: number;
}

export interface LabelObject {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  props: unknown;
}

export type ObjectGroup = 'text' | 'code' | 'shape';

export interface ObjectTypeDefinition<P extends object = object> {
  label: string;
  icon: string;
  group: ObjectGroup;
  defaultProps: P;
  defaultSize: { width: number; height: number };
  toZPL: (obj: LabelObject) => string;
  PropertiesPanel: React.FC<{
    obj: LabelObject;
    onChange: (props: Partial<P>) => void;
  }>;
}
