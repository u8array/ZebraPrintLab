import type { ObjectTypeCore } from "../types/ObjectType";
import { textFieldPos, fdFieldFor, resolveFontCmd } from "./zplHelpers";
import { effectiveScale } from "./transformHelpers";
import { encodeFbContent } from "../lib/fbContent";
import { encodeTbContent } from "../lib/tbContent";
import { type ZplRotation } from "../lib/zebraTextLayout";

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

/** Primary command the text emits in its current mode: plain `^A`, field-block
 *  `^FB`, or text-block `^TB`. Drives the properties header command badge. */
export function textZplCmd(p: Pick<TextProps, "textMode" | "blockWidth">): "^A" | "^FB" | "^TB" {
  const mode = resolveTextMode(p);
  return mode === "fb" ? "^FB" : mode === "tb" ? "^TB" : "^A";
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
  zplCmdFor: (obj) => textZplCmd(obj.props),
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
    // ^FR is the spec-true reverse: it knocks the glyph ink out of whatever is
    // already drawn (e.g. a black ^GB placed behind the text), so we emit it as
    // a bare field flag and never synthesize a background box. The field's
    // position type and any separately-authored box round-trip unchanged.
    const frCmd = p.reverse ? "^FR" : "";
    return [anchor, fpCmd, fontCmd, blockCmd, frCmd, fd].filter(Boolean).join("");
  },
};
