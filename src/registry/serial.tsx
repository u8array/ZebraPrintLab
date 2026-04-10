import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';

export interface SerialProps {
  content: string;
  increment: number;
  fontHeight: number;
  fontWidth: number;
  rotation: 'N' | 'R' | 'I' | 'B';
  zplMode: 'SF' | 'SN';
}

export const serial: ObjectTypeDefinition<SerialProps> = {
  label: 'Serial',
  icon: '#',
  group: 'text' as const,
  defaultProps: {
    content: '001',
    increment: 1,
    fontHeight: 30,
    fontWidth: 0,
    rotation: 'N',
    zplMode: 'SN',
  },
  defaultSize: { width: 100, height: 30 },

  toZPL: (obj) => {
    const p = obj.props;
    const field = `${fieldPos(obj)}^A0${p.rotation},${p.fontHeight},${p.fontWidth}`;
    if (p.zplMode === 'SF') {
      // ^SF: increment, pad-digits (derived from content length), change-per-label
      return `${field}^SF${p.increment},${p.content.length},Y^FD${p.content}^FS`;
    }
    // ^SN: start, increment, change-per-label
    return `${field}^FD${p.content}^FS\n^SN${p.content},${p.increment},Y`;
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.serial.content}</label>
            <input
              className={inputCls}
              value={p.content}
              onChange={(e) => onChange({ content: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.serial.increment}</label>
            <input
              type="number"
              className={inputCls}
              value={p.increment}
              min={1}
              onChange={(e) => onChange({ increment: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.serial.fontHeight}</label>
            <input
              type="number"
              className={inputCls}
              value={p.fontHeight}
              min={1}
              onChange={(e) => onChange({ fontHeight: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.serial.fontWidth}</label>
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
          <label className={labelCls}>{t.registry.serial.rotation}</label>
          <select
            className={inputCls}
            value={p.rotation}
            onChange={(e) => onChange({ rotation: e.target.value as SerialProps['rotation'] })}
          >
            <option value="N">{t.registry.text.rotationN}</option>
            <option value="R">{t.registry.text.rotationR}</option>
            <option value="I">{t.registry.text.rotationI}</option>
            <option value="B">{t.registry.text.rotationB}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.serial.zplMode}</label>
          <select
            className={inputCls}
            value={p.zplMode}
            onChange={(e) => onChange({ zplMode: e.target.value as SerialProps['zplMode'] })}
          >
            <option value="SN">{t.registry.serial.zplModeSN}</option>
            <option value="SF">{t.registry.serial.zplModeSF}</option>
          </select>
        </div>
      </div>
    );
  },
};
