import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: 'N' | 'R' | 'I' | 'B';
}

export const text: ObjectTypeDefinition<TextProps> = {
  label: 'Text',
  icon: 'T',
  group: 'text' as const,
  defaultProps: {
    content: 'Text',
    fontHeight: 30,
    fontWidth: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 40 },

  toZPL: (obj) => {
    const p = obj.props;
    return [
      `^FO${obj.x},${obj.y}`,
      `^A0${p.rotation},${p.fontHeight},${p.fontWidth}`,
      `^FD${p.content}^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.text.fontHeight}</label>
            <input
              type="number"
              className={inputCls}
              value={p.fontHeight}
              min={1}
              onChange={(e) => onChange({ fontHeight: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.text.fontWidth}</label>
            <input
              type="number"
              className={inputCls}
              value={p.fontWidth}
              min={0}
              onChange={(e) => onChange({ fontWidth: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.rotation}</label>
          <select
            className={inputCls}
            value={p.rotation}
            onChange={(e) => onChange({ rotation: e.target.value as TextProps['rotation'] })}
          >
            <option value="N">{t.registry.text.rotationN}</option>
            <option value="R">{t.registry.text.rotationR}</option>
            <option value="I">{t.registry.text.rotationI}</option>
            <option value="B">{t.registry.text.rotationB}</option>
          </select>
        </div>
      </div>
    );
  },
};
