import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';
import { filterContent, type ContentSpec } from './contentSpec';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';

const serialSpec: ContentSpec = { charset: '0-9A-Za-z' };

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
    return `${field}^SN${p.content},${p.increment},Y^FD${p.content}^FS`;
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
              onChange={(e) => onChange({ content: filterContent(e.target.value, serialSpec) })}
            />
          </div>
          <NumberInput
            label={t.registry.serial.increment}
            value={p.increment}
            min={1}
            onChange={(increment) => onChange({ increment })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.serial.fontHeight}
            value={p.fontHeight}
            min={1}
            onChange={(fontHeight) => onChange({ fontHeight })}
          />
          <NumberInput
            label={t.registry.serial.fontWidth}
            value={p.fontWidth}
            min={0}
            onChange={(fontWidth) => onChange({ fontWidth })}
          />
        </div>

        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />

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
