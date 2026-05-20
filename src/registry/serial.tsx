import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { inputCls, labelCls } from "../components/Properties/styles";
import { textFieldPos, fdField, resolveFontCmd } from "./zplHelpers";
import { effectiveScale } from "./transformHelpers";
import { filterContent, type ContentSpec } from "./contentSpec";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";

const serialSpec: ContentSpec = { charset: "0-9A-Za-z" };

export interface SerialProps {
  content: string;
  increment: number;
  fontHeight: number;
  fontWidth: number;
  rotation: "N" | "R" | "I" | "B";
  zplMode: "SF" | "SN";
}

export const serial: ObjectTypeDefinition<SerialProps> = {
  label: "Serial",
  icon: "#",
  group: "text" as const,
  defaultProps: {
    content: "001",
    increment: 1,
    fontHeight: 30,
    fontWidth: 0,
    rotation: "N",
    zplMode: "SN",
  },
  defaultSize: { width: 100, height: 30 },
  // Rectangle resize matching text.tsx — see notes there.
  commitTransform: (obj, ctx) => {
    const oldH = obj.props.fontHeight;
    const oldW = obj.props.fontWidth > 0 ? obj.props.fontWidth : oldH;
    const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
    return {
      fontHeight: Math.max(1, ctx.snap(Math.round(oldH * esy))),
      fontWidth: Math.max(1, ctx.snap(Math.round(oldW * esx))),
    };
  },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    const field = `${textFieldPos(obj)}${resolveFontCmd(p, ctx)}`;
    // Re-apply the input charset filter at emit time so ZPL-imported content
    // (which bypasses the in-app filter) can't smuggle ^/~ into the ^SN start
    // parameter or comma-split the parameter list. fdField additionally
    // hex-escapes any survivors in the FD payload — belt and suspenders.
    const safe = filterContent(p.content, serialSpec);
    if (p.zplMode === "SF") {
      // ^SF: increment, pad-digits (derived from content length), change-per-label
      return `${field}^SF${p.increment},${safe.length},Y${fdField(safe)}`;
    }
    // ^SN: start, increment, change-per-label
    return `${field}^SN${safe},${p.increment},Y${fdField(safe)}`;
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
              onChange={(e) =>
                onChange({ content: filterContent(e.target.value, serialSpec) })
              }
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
            onChange={(e) =>
              onChange({ zplMode: e.target.value as SerialProps["zplMode"] })
            }
          >
            <option value="SN">{t.registry.serial.zplModeSN}</option>
            <option value="SF">{t.registry.serial.zplModeSF}</option>
          </select>
        </div>
      </div>
    );
  },
};
