import type { ObjectTypeCore } from "../types/ObjectType";
import { textFieldPos, fdFieldFor, resolveFontCmd } from "./zplHelpers";
import { getTextRenderMetrics } from "../lib/labelGeometry/textRenderMetrics";
import type { LabelObject } from "../types/Group";
import { effectiveScale } from "./transformHelpers";
import { encodeFbContent } from "../lib/fbContent";
import type { ZplRotation } from "../lib/zebraTextLayout";

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: ZplRotation;
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
  /** ^FB hanging indent (dots) applied to lines 2+. Spec range 0..9999,
   *  negatives are clamped to 0 to match Labelary's observed behavior. */
  blockHangingIndent?: number;
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
      ? `^FB${p.blockWidth},${p.blockLines ?? 1},${p.blockLineSpacing ?? 0},${p.blockJustify ?? "L"},${p.blockHangingIndent ?? 0}`
      : "";
    // Always emit the gap so the round-trip is unambiguous.
    const fpDir = p.fpDirection ?? "H";
    const fpGap = p.fpCharGap ?? 0;
    const fpCmd = fpDir !== "H" || fpGap > 0 ? `^FP${fpDir},${fpGap}` : "";
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
      return [anchor, fpCmd, fontCmd, fbCmd, fd].filter(Boolean).join("");
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
    // round-trip; the box + reverse-text pair is the accepted output until
    // block-text collapse is implemented.
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
    return [gb, anchor, fpCmd, fontCmd, fbCmd, "^FR", fd].filter(Boolean).join("");
  },
};
