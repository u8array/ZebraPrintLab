import type { ObjectTypeDefinition } from '../types/ObjectType';
import t from '../locales/en';
import { inputCls, labelCls } from '../components/Properties/styles';

export interface QrCodeProps {
  content: string;
  magnification: number;       // 1–10, dot size per module
  errorCorrection: 'H' | 'Q' | 'M' | 'L';
}

export const qrcode: ObjectTypeDefinition<QrCodeProps> = {
  label: 'QR Code',
  icon: '⬚',
  group: 'code',
  defaultProps: {
    content: 'https://example.com',
    magnification: 4,
    errorCorrection: 'Q',
  },
  defaultSize: { width: 200, height: 200 },

  toZPL: (obj) => {
    const p = obj.props;
    return [
      `^FO${obj.x},${obj.y}`,
      `^BQN,2,${p.magnification}`,
      `^FD${p.errorCorrection}A,${p.content}^FS`,
    ].join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const p = obj.props;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.qrcode.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.qrcode.magnification}</label>
          <input
            type="number"
            className={inputCls}
            value={p.magnification}
            min={1}
            max={10}
            onChange={(e) => onChange({ magnification: Number(e.target.value) })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.qrcode.errorCorrection}</label>
          <select
            className={inputCls}
            value={p.errorCorrection}
            onChange={(e) => onChange({ errorCorrection: e.target.value as QrCodeProps['errorCorrection'] })}
          >
            <option value="L">{t.registry.qrcode.ecL}</option>
            <option value="M">{t.registry.qrcode.ecM}</option>
            <option value="Q">{t.registry.qrcode.ecQ}</option>
            <option value="H">{t.registry.qrcode.ecH}</option>
          </select>
        </div>
      </div>
    );
  },
};
