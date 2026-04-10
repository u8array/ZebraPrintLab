import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface Code128Props {
  content: string;
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
  checkDigit: boolean;
}

export const code128: ObjectTypeDefinition<Code128Props> = {
  label: 'Code 128',
  icon: '|||',
  group: 'code' as const,
  defaultProps: {
    content: '12345678',
    height: 100,
    moduleWidth: 2,
    printInterpretation: true,
    checkDigit: false,
  },
  defaultSize: { width: 300, height: 120 },

  toZPL: (obj) => {
    const p = obj.props;
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return [
      p.moduleWidth !== 2 ? `^BY${p.moduleWidth}` : '',
      `^FO${obj.x},${obj.y}`,
      `^BCN,${p.height},${interp},N,${check}`,
      `^FD${p.content}^FS`,
    ].filter(Boolean).join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.code128.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.code128.height}</label>
          <input
            type="number"
            className={inputCls}
            value={p.height}
            min={1}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.code128.moduleWidth}</label>
          <input
            type="number"
            className={inputCls}
            value={p.moduleWidth}
            min={1}
            max={10}
            onChange={(e) => onChange({ moduleWidth: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.printInterpretation}
              onChange={(e) => onChange({ printInterpretation: e.target.checked })}
            />
            <span className={labelCls}>{t.registry.code128.printInterpretation}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.checkDigit}
              onChange={(e) => onChange({ checkDigit: e.target.checked })}
            />
            <span className={labelCls}>{t.registry.code128.checkDigit}</span>
          </label>
        </div>
      </div>
    );
  },
};
