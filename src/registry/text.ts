import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: 'N' | 'R' | 'I' | 'B';
}

export const text: ObjectTypeDefinition<TextProps> = {
  label: 'Text',
  icon: 'T',
  defaultProps: {
    content: 'Text',
    fontHeight: 30,
    fontWidth: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 40 },
  toZPL: (obj: LabelObject): string => {
    const p = obj.props as TextProps;
    return [
      `^FO${obj.x},${obj.y}`,
      `^A0${p.rotation},${p.fontHeight},${p.fontWidth}`,
      `^FD${p.content}^FS`,
    ].join('');
  },
  PropertiesPanel: () => null, // TODO: TextPropertiesPanel
};
