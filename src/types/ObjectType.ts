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
  props: Record<string, unknown>;
}

export interface ObjectTypeDefinition<P = Record<string, unknown>> {
  label: string;
  icon: string;
  defaultProps: P;
  defaultSize: { width: number; height: number };
  toZPL: (obj: LabelObject) => string;
  PropertiesPanel: React.FC<{
    obj: LabelObject;
    onChange: (props: Partial<P>) => void;
  }>;
}
