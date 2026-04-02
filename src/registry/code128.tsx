import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';
import t from '../locales/en';

export interface Code128Props {
  content: string;
  height: number;
  printInterpretation: boolean;
  checkDigit: boolean;
}

const inputCls = 'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs font-mono text-text focus:border-accent focus:outline-none';
const labelCls = 'font-mono text-[10px] text-muted uppercase tracking-wider';

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

  PropertiesPanel: ({ obj, onChange }) => {
    const p = obj.props as Code128Props;
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
