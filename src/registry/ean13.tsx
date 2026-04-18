import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';

export interface Ean13Props {
  content: string;        // 12 digits — ZPL appends the check digit automatically
  height: number;
  moduleWidth: number;
  printInterpretation: boolean;
}

export const ean13: ObjectTypeDefinition<Ean13Props> = {
  label: 'EAN-13',
  icon: 'EAN',
  group: 'code',
  defaultProps: {
    content: '590123412345',
    height: 100,
    moduleWidth: 2,
    printInterpretation: true,
  },
  defaultSize: { width: 300, height: 120 },

  toZPL: (obj) => {
    const p = obj.props;
    const interp = p.printInterpretation ? 'Y' : 'N';
    return [
      `^BY${p.moduleWidth}`,
      fieldPos(obj),
      `^BEN,${p.height},${interp},N`,
      `^FD${p.content}^FS`,
    ].filter(Boolean).join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.ean13.content}</label>
          <input
            className={inputCls}
            value={p.content}
            maxLength={12}
            placeholder={t.registry.ean13.placeholder}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.ean13.height}</label>
          <input
            type="number"
            className={inputCls}
            value={p.height}
            min={1}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.ean13.moduleWidth}</label>
          <input
            type="number"
            className={inputCls}
            value={p.moduleWidth}
            min={1}
            max={10}
            onChange={(e) => onChange({ moduleWidth: Number(e.target.value) })}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.printInterpretation}
            onChange={(e) => onChange({ printInterpretation: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.ean13.printInterpretation}</span>
        </label>
      </div>
    );
  },
};
