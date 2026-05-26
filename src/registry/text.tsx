import { useRef, useState, useCallback } from "react";
import type { ObjectTypeDefinition } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { buttonCls, inputCls, labelCls } from "../components/Properties/styles";
import { textFieldPos, fdFieldFor, resolveFontCmd } from "./zplHelpers";
import { getTextRenderMetrics } from "../components/Canvas/textRenderMetrics";
import type { LabelObject } from "../types/Group";
import { effectiveScale } from "./transformHelpers";
import { getFont, loadFontFile } from "../lib/fontCache";
import { getAvailableFontIds, stripDrivePrefix } from "../lib/customFonts";
import { useFontCacheVersion } from "../hooks/useFontCacheVersion";
import { useLabelStore } from "../store/labelStore";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { TemplateContentInput } from "../components/Properties/TemplateContentInput";
import { BlockTextSettings } from "../components/Properties/BlockTextSettings";
import { encodeFbContent } from "../lib/fbContent";
import { deriveBlockTextPatch, FB_DEFAULTS } from "../lib/textBlock";

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
    // ^FB block-text uses `\&` as the in-payload line-break marker
    // (Zebra spec). Encode via the shared helper so parser/generator
    // stay symmetric (it also escapes literal backslashes so payloads
    // containing `\&` round-trip without corruption). Outside ^FB the
    // printer ignores embedded newlines anyway, so encoding only
    // happens when blockWidth is set.
    const content = p.blockWidth ? encodeFbContent(p.content) : p.content;
    const anchor = textFieldPos(obj);
    const fd = fdFieldFor(obj, content, ctx);
    if (!p.reverse) {
      return [anchor, fontCmd, fbCmd, fd].filter(Boolean).join("");
    }
    // Reverse text = white-on-black knockout. Standard ZPL pattern:
    // a filled black ^GB at the field anchor, then the text with ^FR
    // (Field Reverse) which inverts the ink within the field bounds,
    // knocking the glyphs out of the black. ^GB and the text share
    // the same ^FO so the box top aligns with the text cap-top.
    // Box dimensions match the rendered ink: width from measured
    // metrics, height from fontHeight. For R/B rotations the visible
    // bbox is fontHeight wide by inkWidth tall, so the dimensions
    // swap.
    const metrics = getTextRenderMetrics(obj as unknown as LabelObject);
    const fallback = p.fontWidth || p.fontHeight;
    const inkW = Math.max(1, Math.round(metrics?.inkWidthDots ?? fallback));
    const vertical = p.rotation === "R" || p.rotation === "B";
    // ^FB block-text wraps to blockWidth across up to blockLines rows,
    // so the bg has to cover the block area instead of the single-line
    // ink bbox. blockLineSpacing is added per row above the first to
    // mirror Zebra's row advance. The parser skips collapse for
    // fbWidth>0 so this branch produces a box + reverse-text pair on
    // round-trip — accepted trade-off until block-text collapse lands.
    const block = p.blockWidth ?? 0;
    const lines = p.blockLines ?? 1;
    const blockH = p.fontHeight * lines + (p.blockLineSpacing ?? 0) * Math.max(0, lines - 1);
    const baseW = block > 0 ? block : inkW;
    const baseH = block > 0 ? blockH : p.fontHeight;
    const gbW = vertical ? baseH : baseW;
    const gbH = vertical ? baseW : baseH;
    // Thickness = min(w,h) keeps the box filled (Zebra requires t >=
    // min(w,h) for a solid fill) without triggering the dimension
    // promotion. ZPL promotes the box to `max(w,t) × max(h,t)`; using
    // max here would inflate a 200×30 banner into a 200×200 square.
    const gbThickness = Math.min(gbW, gbH);
    const gb = `${anchor}^GB${gbW},${gbH},${gbThickness},B,0^FS`;
    return [gb, anchor, fontCmd, fbCmd, "^FR", fd].filter(Boolean).join("");
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
            objectId={obj.id}
            value={p.content}
            onChange={(content) => onChange(deriveBlockTextPatch(content, p))}
          />
        </div>

        {/* Block-Text settings sit directly under the content editor
            because they govern how that content renders (wrap width,
            max lines, justify) — keeping them adjacent makes the
            cause/effect relationship obvious. Other settings (font,
            rotation, reverse) act on the whole field and come below. */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!p.blockWidth}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { ...FB_DEFAULTS, blockLines: 3 }
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

        {!!p.blockWidth && <BlockTextSettings props={p} onChange={onChange} />}

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
      </div>
    );
  },
};
