import type React from 'react';

export interface LabelConfig {
  widthMm: number;
  heightMm: number;
  dpmm: number;
  printQuantity?: number;
  mediaMode?: 'T' | 'V' | 'D' | 'K';
  labelShift?: number;
}

/** Common fields shared by every label object, without the typed `props`. */
export interface LabelObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  /** How this object's x/y were originally positioned.
   *  'FT' = field typeset (baseline), 'FO' = field origin (top-left).
   *  Defaults to 'FO' for new objects. */
  positionType?: 'FO' | 'FT';
}

export type ObjectGroup = 'text' | 'code' | 'shape';

export interface ObjectTypeDefinition<P extends object = object> {
  label: string;
  icon: string;
  group: ObjectGroup;
  defaultProps: P;
  defaultSize: { width: number; height: number };
  toZPL: (obj: LabelObjectBase & { props: P }) => string;
  PropertiesPanel: React.FC<{
    obj: LabelObjectBase & { props: P };
    onChange: (props: Partial<P>) => void;
  }>;
}
