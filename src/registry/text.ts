import type { ObjectTypeCore } from "../types/ObjectType";
import { textFieldPos, fdFieldFor, resolveFontCmd } from "./zplHelpers";
import { getTextRenderMetrics } from "../lib/labelGeometry/textRenderMetrics";
import type { LabelObject } from "../types/Group";
import { effectiveScale } from "./transformHelpers";
import { encodeFbContent } from "../lib/fbContent";
import { encodeTbContent } from "../lib/tbContent";
import type { ZplRotation } from "../lib/zebraTextLayout";

/** Text layout mode. 'normal' = plain ^A (no wrap), 'fb' = ^FB field
 *  block (max-lines cap, justify, hanging indent), 'tb' = ^TB text block
 *  (word-wrap clipped at a pixel height). Only 'tb' is stored explicitly;
 *  'normal' vs 'fb' is inferred from blockWidth presence so legacy designs
 *  and ^FB imports keep working. Read it through `resolveTextMode`. */
export type TextMode = "normal" | "fb" | "tb";

export function resolveTextMode(p: Pick<TextProps, "textMode" | "blockWidth">): TextMode {
  if (p.textMode) return p.textMode;
  return p.blockWidth ? "fb" : "normal";
}

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: ZplRotation;
  reverse?: boolean;
  /** Stored only for 'tb' (the one mode blockWidth can't disambiguate from
   *  ^FB). See `resolveTextMode`. */
  textMode?: TextMode;
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
  /** ^FB hanging indent (dots) applied to lines 2+. Spec range 0..9999,
   *  negatives are clamped to 0 to match Labelary's observed behavior. */
  blockHangingIndent?: number;
  /** ^TB block height in dots; the rendered text is clipped at this height
   *  (Labelary truncates mid-glyph). tb-mode only. */
  blockHeight?: number;
  /** ^FP field-direction modifier. 'H' = horizontal advance (default,
   *  omitted on emit), 'V' = stack glyphs along the field's
   *  perpendicular axis, 'R' = reverse glyph order (RTL languages). */
  fpDirection?: "H" | "V" | "R";
  /** ^FP inter-character gap in dots, added on top of the font's
   *  natural advance. Omitted on emit when 0. */
  fpCharGap?: number;
}

export const text: ObjectTypeCore<TextProps> = {
  label: "Text",
  icon: "T",
  zplCmd: "^A",
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
  // Canonical un-emit shape so round-trips stay diff-free.
  normalizeChanges: (_obj, changes) => {
    const nextProps = changes.props as Partial<TextProps> | undefined;
    if (!nextProps) return changes;
    let patched = nextProps;
    if (patched.fpDirection === "H") patched = { ...patched, fpDirection: undefined };
    if (patched.fpCharGap === 0) patched = { ...patched, fpCharGap: undefined };
    return patched === nextProps ? changes : { ...changes, props: patched };
  },

  commitTransform: (obj, ctx) => {
    const oldH = obj.props.fontHeight;
    const oldW = obj.props.fontWidth > 0 ? obj.props.fontWidth : oldH;
    const mode = resolveTextMode(obj.props);
    const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
    // Frame mode (^FB/^TB blocks, default): the box is the wrap frame, so X
    // grows blockWidth (reflow); Y grows the line cap (^FB) or the clip height
    // (^TB). Glyph mode (and plain text): X/Y stretch the font. The canvas
    // picks the mode from the toggle, with Alt as a per-drag override.
    const frameMode = mode !== "normal" && ctx.resizeMode !== "glyph";
    if (frameMode) {
      const oldBW = obj.props.blockWidth ?? 1;
      const blockWidth = Math.max(1, ctx.snap(Math.round(oldBW * esx)));
      if (mode === "tb") {
        const oldBH = obj.props.blockHeight ?? oldH;
        return { blockWidth, blockHeight: Math.max(1, ctx.snap(Math.round(oldBH * esy))) };
      }
      const oldLines = obj.props.blockLines ?? 1;
      return { blockWidth, blockLines: Math.max(1, Math.round(oldLines * esy)) };
    }
    return {
      fontHeight: Math.max(1, ctx.snap(Math.round(oldH * esy))),
      fontWidth: Math.max(1, ctx.snap(Math.round(oldW * esx))),
    };
  },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    const mode = resolveTextMode(p);
    const fontCmd = resolveFontCmd(p, ctx);
    // ^FB uses `\&` line-breaks + soft hyphens; ^TB has neither and instead
    // escapes `<` as `<<>` (verified via Labelary). Literal `content` is
    // pre-encoded here (before fdFieldFor substitutes ^FE/^FC markers, which
    // must not be re-encoded); the bound-variable default is encoded inside
    // fdFieldFor via `encodeDefault`. Each encoder is symmetric with the
    // matching parser decoder, so payloads round-trip.
    let blockCmd = "";
    let content = p.content;
    let encodeDefault: (s: string) => string = (s) => s;
    if (mode === "fb") {
      blockCmd = `^FB${p.blockWidth ?? 0},${p.blockLines ?? 1},${p.blockLineSpacing ?? 0},${p.blockJustify ?? "L"},${p.blockHangingIndent ?? 0}`;
      content = encodeFbContent(p.content);
    } else if (mode === "tb") {
      blockCmd = `^TB${p.rotation},${p.blockWidth ?? 0},${p.blockHeight ?? 0}`;
      content = encodeTbContent(p.content);
      encodeDefault = encodeTbContent;
    }
    // Always emit the gap so the round-trip is unambiguous.
    const fpDir = p.fpDirection ?? "H";
    const fpGap = p.fpCharGap ?? 0;
    const fpCmd = fpDir !== "H" || fpGap > 0 ? `^FP${fpDir},${fpGap}` : "";
    const anchor = textFieldPos(obj);
    const fd = fdFieldFor(obj, content, ctx, undefined, encodeDefault);
    if (!p.reverse) {
      return [anchor, fpCmd, fontCmd, blockCmd, fd].filter(Boolean).join("");
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
    // Block text covers the block area instead of the single-line ink bbox:
    // ^FB spans blockLines rows (plus per-row spacing), ^TB spans its clip
    // height. The parser collapses this ^GB + ^FR pair back to one reverse
    // block on re-import, so the round-trip stays idempotent.
    let baseW: number;
    let baseH: number;
    if (mode === "tb") {
      baseW = p.blockWidth ?? inkW;
      baseH = p.blockHeight ?? p.fontHeight;
    } else if (mode === "fb") {
      const lines = p.blockLines ?? 1;
      baseW = p.blockWidth ?? inkW;
      baseH = p.fontHeight * lines + (p.blockLineSpacing ?? 0) * Math.max(0, lines - 1);
    } else {
      baseW = inkW;
      baseH = p.fontHeight;
    }
    const gbW = vertical ? baseH : baseW;
    const gbH = vertical ? baseW : baseH;
    // Thickness = min(w,h) keeps the box filled (Zebra requires t >=
    // min(w,h) for a solid fill) without triggering the dimension
    // promotion. ZPL promotes the box to `max(w,t) × max(h,t)`; using
    // max here would inflate a 200×30 banner into a 200×200 square.
    const gbThickness = Math.min(gbW, gbH);
    const gb = `${anchor}^GB${gbW},${gbH},${gbThickness},B,0^FS`;
    return [gb, anchor, fpCmd, fontCmd, blockCmd, "^FR", fd].filter(Boolean).join("");
  },
};
