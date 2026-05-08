import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos, fdField } from './zplHelpers';
import { commitUniformScaleTransform } from './transformHelpers';
import { type ZplRotation } from './rotation';
import { RotationSelect } from '../components/Properties/RotationSelect';
import { NumberInput } from '../components/Properties/NumberInput';

const MAGNIFICATION_MIN = 1;
const MAGNIFICATION_MAX = 10;

export interface QrCodeProps {
  content: string;
  magnification: number;       // dot size per module
  errorCorrection: 'H' | 'Q' | 'M' | 'L';
  rotation: ZplRotation;
}

export const qrcode: ObjectTypeDefinition<QrCodeProps> = {
  label: 'QR Code',
  icon: '⬚',
  group: 'code-2d',
  defaultProps: {
    content: 'https://example.com',
    magnification: 4,
    errorCorrection: 'Q',
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  commitTransform: commitUniformScaleTransform('magnification', MAGNIFICATION_MIN, MAGNIFICATION_MAX),

  toZPL: (obj) => {
    const p = obj.props;
    return [
      fieldPos(obj),
      `^BQ${p.rotation},2,${p.magnification}`,
      fdField(`${p.errorCorrection}A,${p.content}`),
    ].join('');
  },

  // Zebra firmware adds a hardcoded +10 dot Y-offset to ^FO QR codes; Labelary
  // does not handle negative y values cleanly (^FO0,-10 renders at image y=20,
  // not y=0). Clamping y >= 0 here keeps the designer's visual position in sync
  // with Labelary preview. Only applies when y is being explicitly changed —
  // existing negative values from ZPL import are preserved until edited.
  normalizeChanges: (obj, changes) => {
    if (changes.y === undefined || changes.y >= 0) return changes;
    const positionType = changes.positionType ?? obj.positionType;
    return positionType === 'FT' ? changes : { ...changes, y: 0 };
  },

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
