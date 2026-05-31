import type { ObjectTypeUi } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';
import { type QrCodeProps, MAGNIFICATION_MIN, MAGNIFICATION_MAX } from './qrcode';

export const qrcodePanel: ObjectTypeUi<QrCodeProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
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

        <NumberInput
          label={t.registry.qrcode.magnification}
          value={p.magnification}
          min={MAGNIFICATION_MIN}
          max={MAGNIFICATION_MAX}
          onChange={(magnification) => onChange({ magnification })}
        />

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

        <RotationSelect value={p.rotation} onChange={(rotation) => onChange({ rotation })} />
      </div>
    );
  },
};
