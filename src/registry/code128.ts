import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';

export interface Code128Props {
  content: string;
  height: number;
  printInterpretation: boolean;
  checkDigit: boolean;
}

export const code128: ObjectTypeDefinition<Code128Props> = {
  label: 'Code 128',
  icon: '|||',
  defaultProps: {
    content: '12345678',
    height: 100,
    printInterpretation: true,
    checkDigit: false,
  },
  defaultSize: { width: 300, height: 120 },
  toZPL: (obj: LabelObject): string => {
    const p = obj.props as Code128Props;
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return [
      `^FO${obj.x},${obj.y}`,
      `^BCN,${p.height},${interp},N,${check}`,
      `^FD${p.content}^FS`,
    ].join('');
  },
  PropertiesPanel: () => null, // TODO: Code128PropertiesPanel
};
