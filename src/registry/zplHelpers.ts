import type { LabelObjectBase } from "../types/LabelObject";
import type { ZplEmitContext } from "../types/ZplEmit";
import { hasTemplateMarkers, markersToEmbeds } from "../lib/fnTemplate";
import { hasClockMarkers, markersToTokens } from "../lib/fcTemplate";
import { modelToZplAnchor } from "../lib/labelGeometry/textPositionTransforms";
import { getTextRenderMetrics } from "../lib/labelGeometry/textRenderMetrics";
import { blockInterLineExtentDots } from "../lib/zebraTextLayout";
import type { LabelObject } from "../types/Group";

/** Emit `^FT` or `^FO` depending on how the object was originally positioned. */
export function fieldPos(obj: LabelObjectBase): string {
  const cmd = obj.positionType === "FT" ? "FT" : "FO";
  return `^${cmd}${obj.x},${obj.y}`;
}

/** Symmetric with parser's ^LR state flip at ^LRN. */
export function wrapReverse(reverse: boolean | undefined, body: string): string {
  return reverse ? `^LRY${body}^LRN` : body;
}

interface TextLikeObjForFieldPos extends LabelObjectBase {
  props: {
    fontHeight: number;
    rotation: "N" | "R" | "I" | "B";
    blockWidth?: number;
    blockLines?: number;
    blockLineSpacing?: number;
    textMode?: "normal" | "fb" | "tb";
    blockHeight?: number;
  };
}

/** Vertical extent of a block beyond its first line, in dots. Shifts the
 *  FT baseline / FO-R/I anchor. ^TB is a fixed clip height; ^FB stacks lines. */
function blockExtentFor(p: TextLikeObjForFieldPos["props"]): number {
  if (p.textMode === "tb") {
    return Math.max(0, (p.blockHeight ?? p.fontHeight) - p.fontHeight);
  }
  return blockInterLineExtentDots({
    blockWidthDots: p.blockWidth ?? 0,
    blockLines: p.blockLines ?? 1,
    blockLineSpacing: p.blockLineSpacing ?? 0,
    fontHeight: p.fontHeight,
  });
}

/** Priority: fontId -> printerFontName -> ctx defaultFontId -> ^A0. */
export function resolveFontCmd(
  props: {
    rotation: "N" | "R" | "I" | "B";
    fontHeight: number;
    fontWidth: number;
    fontId?: string;
    printerFontName?: string;
  },
  ctx?: ZplEmitContext,
): string {
  const { rotation, fontHeight, fontWidth, fontId, printerFontName } = props;
  if (fontId) {
    return `^A${fontId}${rotation},${fontHeight},${fontWidth}`;
  }
  if (printerFontName) {
    return `^A@${rotation},${fontHeight},${fontWidth},E:${printerFontName}`;
  }
  const defaultId = ctx?.label.defaultFontId;
  if (defaultId) {
    return `^A${defaultId}${rotation},${fontHeight},${fontWidth}`;
  }
  return `^A0${rotation},${fontHeight},${fontWidth}`;
}

/** Converts EM top-left model coord to ZPL anchor (cap-top/baseline). */
export function textFieldPos(obj: TextLikeObjForFieldPos): string {
  const cmd = obj.positionType === "FT" ? "FT" : "FO";
  const metrics = getTextRenderMetrics(obj as unknown as LabelObject);
  const p = obj.props;
  const blockExtentDots = blockExtentFor(p);
  const a = modelToZplAnchor(
    obj.x,
    obj.y,
    obj.props,
    obj.positionType,
    metrics?.inkWidthDots ?? 0,
    blockExtentDots,
    p.blockWidth ?? 0,
  );
  // ^FO/^FT take integers; firmware would truncate fractional residue anyway.
  return `^${cmd}${Math.round(a.x)},${Math.round(a.y)}`;
}

/** ^FX has no ^FH escape; strip ^/~ to prevent surrounding-command termination. */
export function stripZplCommandChars(s: string): string {
  return s.replace(/[\^~]/g, "");
}

const FH_DELIM = "_";
const NEEDS_FH = /[\^~]/;

function hex(ch: string): string {
  return (
    FH_DELIM + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
  );
}

/** Hex-escape ^/~ via ^FH_ (and _ itself) so user content can't smuggle commands. */
export function fdField(payload: string): string {
  if (!NEEDS_FH.test(payload)) return `^FD${payload}^FS`;
  const escaped = payload.replace(/[\^~_]/g, hex);
  return `^FH${FH_DELIM}^FD${escaped}^FS`;
}

/** Bound variableId emits `^FN{n}` + default; orphan falls back to literal.
 *  `transform` (e.g. GS1 FNC1 escaping) is applied to the final field-data
 *  payload so it composes with binding instead of bypassing it. `encodeDefault`
 *  block-encodes only the bound default (e.g. ^TB `<<>` escaping); literal/
 *  template `content` must already be encoded by the caller, since encoding
 *  after marker substitution would corrupt the inserted ^FE/^FC tokens. */
export function fdFieldFor(
  obj: LabelObjectBase,
  content: string,
  ctx?: ZplEmitContext,
  transform: (payload: string) => string = (s) => s,
  encodeDefault: (payload: string) => string = (s) => s,
): string {
  // Single-bind wins, mirroring preview (`applyBindingToObject`): emit the
  // variable's ^FN + default literally, never expanding a marker that happens
  // to sit inside the (mirrored) default. Resolving variableId before markers
  // is what keeps preview and export from diverging on such a value.
  const id = obj.variableId;
  if (id && ctx?.variables) {
    const variable = ctx.variables.find((v) => v.id === id);
    if (variable) return `^FN${variable.fnNumber}${fdField(transform(encodeDefault(variable.defaultValue)))}`;
  }
  // Template path: ^FE embeds first then ^FC clock; absent ctx delim signals
  // "templates not emittable" and the content stays literal.
  let payload = content;
  if (ctx?.variables && ctx.embedChar && hasTemplateMarkers(payload)) {
    payload = markersToEmbeds(payload, ctx.variables, ctx.embedChar).payload;
  }
  if (ctx?.clockChars && hasClockMarkers(payload)) {
    payload = markersToTokens(payload, ctx.clockChars);
  }
  return fdField(transform(payload));
}
