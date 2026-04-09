import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface Code39Props {
  content: string;
  height: number;
  printInterpretation: boolean;
  checkDigit: boolean;
}

export const code39: ObjectTypeDefinition<Code39Props> = {
  label: 'Code 39',
  icon: '|·|',
  group: 'code',
  defaultProps: {
    content: 'CODE39',
    height: 100,
    printInterpretation: true,
    checkDigit: false,
  },
  defaultSize: { width: 300, height: 120 },

  toZPL: (obj) => {
    const p = obj.props;
    const interp = p.printInterpretation ? 'Y' : 'N';
    const check = p.checkDigit ? 'Y' : 'N';
    return [
      `^FO${obj.x},${obj.y}`,
      `^B3N,${check},${p.height},${interp},N`,
      `^FD${p.content}^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.code39.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.code39.height}</label>
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
            <span className={labelCls}>{t.registry.code39.printInterpretation}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={p.checkDigit}
              onChange={(e) => onChange({ checkDigit: e.target.checked })}
            />
            <span className={labelCls}>{t.registry.code39.checkDigit}</span>
          </label>
        </div>
      </div>
    );
  },
};
