import { useRef, useState, useCallback } from "react";
import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { buttonCls, inputCls, labelCls } from "../components/Properties/styles";
import { textFieldPos, fdFieldFor, resolveFontCmd, wrapReverse } from "./zplHelpers";
import { effectiveScale } from "./transformHelpers";
import { getFont, loadFontFile } from "../lib/fontCache";
import { getAvailableFontIds, stripDrivePrefix } from "../lib/customFonts";
import { useFontCacheVersion } from "../hooks/useFontCacheVersion";
import { useLabelStore } from "../store/labelStore";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { TemplateContentInput } from "../components/Properties/TemplateContentInput";

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: "N" | "R" | "I" | "B";
  reverse?: boolean;
  /** Printer-stored TrueType font filename. Round-trips with the
   *  `^A@{rot},{h},{w},E:NAME.TTF` form when the field references a
   *  printer-resident font directly by path. Mutually exclusive with
   *  `fontId`; if both happen to be set, `fontId` wins at emit. */
  printerFontName?: string;
  /** Single-character font identifier ([0-9A-Z]) referencing a built-in
   *  Zebra font (0, A-H) or a ^CW alias registered on the label. Emits
   *  the short `^A{id}{rot},{h},{w}` form. Mutually exclusive with
   *  `printerFontName`. */
  fontId?: string;
  /** ^FB field block properties */
  blockWidth?: number;
  blockLines?: number;
  blockLineSpacing?: number;
  blockJustify?: "L" | "C" | "R" | "J";
}

export const text: ObjectTypeDefinition<TextProps> = {
  label: "Text",
  icon: "T",
  group: "text" as const,
  bindable: true,
  defaultProps: {
    content: "Text",
    fontHeight: 30,
    fontWidth: 0,
    rotation: "N",
  },
  defaultSize: { width: 200, height: 40 },
  // Rectangle resize: corner drag updates fontHeight from sy and
  // fontWidth from sx independently. fontWidth=0 in storage is the
  // Zebra default meaning "match height"; in that case the effective
  // pre-resize width equals fontHeight, so we scale that derived value
  // by sx and persist the result. `effectiveScale` flips sx/sy for R/B
  // rotations so the user's screen-vertical drag stays attached to
  // fontHeight regardless of how Konva orients the glyphs.
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
    const fontCmd = resolveFontCmd(p, ctx);
    const fbCmd = p.blockWidth
      ? `^FB${p.blockWidth},${p.blockLines ?? 1},${p.blockLineSpacing ?? 0},${p.blockJustify ?? "L"},0`
      : "";
    const body = [textFieldPos(obj), fontCmd, fbCmd, fdFieldFor(obj, p.content, ctx)]
      .filter(Boolean)
      .join("");
    return wrapReverse(p.reverse, body);
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    useFontCacheVersion();
    const label = useLabelStore((s) => s.label);

    // Font picker options: every alias the user can reference from this
    // field, in this order — "(use label default)" → built-ins (0, A-H)
    // → custom ^CW aliases. The selected fontId pins a specific ID on
    // the field via the ^A{id} short form. The legacy filename-based
    // override (printerFontName, ^A@…E:NAME.TTF) lives behind the
    // advanced reveal because round-trip-imported labels still rely on
    // it, but the alias dropdown covers every fresh design.
    const fontIdOptions = getAvailableFontIds(label);
    const fontLoaded = !!p.printerFontName && !!getFont(p.printerFontName);
    const fontAssignedButMissing = !!p.printerFontName && !fontLoaded;
    const [showAdvanced, setShowAdvanced] = useState(!!p.printerFontName);

    const handleFontUpload = useCallback(
      async (file: File) => {
        if (!p.printerFontName) return;
        setUploading(true);
        try {
          await loadFontFile(file, p.printerFontName);
        } finally {
          setUploading(false);
        }
      },
      [p.printerFontName],
    );

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.printerFont}</label>
          <select
            className={inputCls}
            value={p.fontId ?? ""}
            onChange={(e) =>
              onChange({
                fontId: e.target.value || undefined,
                // Selecting an alias supersedes the legacy filename form.
                printerFontName: e.target.value ? undefined : p.printerFontName,
              })
            }
          >
            <option value="">{t.registry.text.useLabelDefault}</option>
            {fontIdOptions.map((opt) => {
              const previewName =
                opt.previewFontName ??
                (opt.path ? stripDrivePrefix(opt.path) : undefined);
              const suffix = previewName
                ? ` — ${previewName}`
                : opt.builtin
                  ? `  ${t.registry.text.builtinSuffix}`
                  : "";
              return (
                <option key={opt.id} value={opt.id}>
                  {opt.id}
                  {suffix}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="text-[10px] text-muted hover:text-text text-left mt-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? `▾ ${t.registry.text.fontAdvanced}`
              : `▸ ${t.registry.text.fontAdvanced}`}
          </button>
          {showAdvanced && (
            <div className="flex flex-col gap-1 mt-1 pl-3 border-l border-border">
              <label className="text-[10px] text-muted">
                {t.registry.text.fontFilenameLabel}
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="ARIAL.TTF"
                value={p.printerFontName ?? ""}
                onChange={(e) =>
                  onChange({
                    printerFontName: e.target.value || undefined,
                    fontId: e.target.value ? undefined : p.fontId,
                  })
                }
              />
              {fontLoaded && (
                <span className="text-[10px] text-accent font-mono">
                  {t.registry.text.fontLoaded}
                </span>
              )}
              {fontAssignedButMissing && (
                <>
                  <span className="text-[10px] text-muted font-mono">
                    {t.registry.text.fontMissing}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".ttf,.otf,.TTF,.OTF"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFontUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={buttonCls}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading
                      ? t.registry.text.uploadingFont
                      : t.registry.text.uploadFont}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.content}</label>
          <TemplateContentInput
            value={p.content}
            onChange={(content) => onChange({ content })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.text.fontHeight}
            value={p.fontHeight}
            min={1}
            onChange={(fontHeight) => onChange({ fontHeight })}
          />
          <NumberInput
            label={t.registry.text.fontWidth}
            value={p.fontWidth}
            min={0}
            onChange={(fontWidth) => onChange({ fontWidth })}
          />
        </div>

        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.reverse ?? false}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.text.reverse}</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!p.blockWidth}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? {
                      blockWidth: 400,
                      blockLines: 3,
                      blockLineSpacing: 0,
                      blockJustify: "L",
                    }
                  : {
                      blockWidth: undefined,
                      blockLines: undefined,
                      blockLineSpacing: undefined,
                      blockJustify: undefined,
                    },
              )
            }
          />
          <span className={labelCls}>{t.registry.text.fieldBlock}</span>
        </label>

        {!!p.blockWidth && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label={t.registry.text.blockWidth}
                value={p.blockWidth}
                min={1}
                onChange={(blockWidth) => onChange({ blockWidth })}
              />
              <NumberInput
                label={t.registry.text.blockLines}
                value={p.blockLines ?? 1}
                min={1}
                onChange={(blockLines) => onChange({ blockLines })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>
                  {t.registry.text.blockJustify}
                </label>
                <select
                  className={inputCls}
                  value={p.blockJustify ?? "L"}
                  onChange={(e) =>
                    onChange({
                      blockJustify: e.target.value as TextProps["blockJustify"],
                    })
                  }
                >
                  <option value="L">{t.registry.text.justifyL}</option>
                  <option value="C">{t.registry.text.justifyC}</option>
                  <option value="R">{t.registry.text.justifyR}</option>
                  <option value="J">{t.registry.text.justifyJ}</option>
                </select>
              </div>
              <NumberInput
                label={t.registry.text.blockLineSpacing}
                value={p.blockLineSpacing ?? 0}
                onChange={(blockLineSpacing) => onChange({ blockLineSpacing })}
              />
            </div>
          </>
        )}
      </div>
    );
  },
};
