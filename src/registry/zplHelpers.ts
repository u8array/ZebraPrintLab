import type { LabelObjectBase, ZplEmitContext } from "../types/ObjectType";
import { modelToZplAnchor } from "../components/Canvas/textPositionTransforms";
import { getTextRenderMetrics } from "../components/Canvas/textRenderMetrics";
import type { LabelObject } from "../types/Group";

/** Emit `^FT` or `^FO` depending on how the object was originally positioned. */
export function fieldPos(obj: LabelObjectBase): string {
  const cmd = obj.positionType === "FT" ? "FT" : "FO";
  return `^${cmd}${obj.x},${obj.y}`;
}

interface TextLikeObjForFieldPos extends LabelObjectBase {
  props: { fontHeight: number; rotation: "N" | "R" | "I" | "B" };
}

/** Build the `^A…` font command for a text-like field. Priority order:
 *  explicit `fontId` (short `^A{id}` form) → explicit `printerFontName`
 *  (long `^A@,…E:NAME.TTF` form) → label-wide `defaultFontId` from
 *  `ctx.label` → `^A0` (the historical baseline). The default-fallback
 *  branch is what gives `^CF` user-visible effect: ZPL has no "use the
 *  ^CF font" syntax for per-field ^A, so we splice the default ID in at
 *  emit time. Without `ctx`, falls straight through to `^A0`, which
 *  matches the behaviour direct test callers have always seen. */
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

/** Emit `^FT` or `^FO` for text/serial objects. obj.x/y is stored as the
 *  Konva render position (EM top-left); the ZPL anchor (cap-top for ^FO,
 *  baseline for ^FT) sits a rotation- and positionType-dependent offset
 *  away. This conversion happens here so editor interactions stay in a
 *  single coord system. */
export function textFieldPos(obj: TextLikeObjForFieldPos): string {
  const cmd = obj.positionType === "FT" ? "FT" : "FO";
  const metrics = getTextRenderMetrics(obj as unknown as LabelObject);
  const a = modelToZplAnchor(
    obj.x,
    obj.y,
    obj.props,
    obj.positionType,
    metrics?.inkWidthDots ?? 0,
  );
  // Round to integer dots: ZPL ^FO/^FT take integer coordinates and the
  // shift math adds non-trivial fractional residue that the printer
  // firmware would truncate anyway.
  return `^${cmd}${Math.round(a.x)},${Math.round(a.y)}`;
}

/**
 * Remove ZPL command/format prefixes from free-form text. `^FX` (comment) and
 * other text-only contexts have no `^FH` escape mechanism, so these chars
 * cannot be encoded — strip them so a stray `^` or `~` cannot terminate the
 * surrounding command.
 */
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

/**
 * Build a `^FD…^FS` block, hex-escaping `^` and `~` so user content cannot
 * smuggle ZPL commands. Caret/tilde are the format and command prefixes; if a
 * label payload contains them raw, the firmware will reinterpret them as new
 * commands and the field truncates or the whole block becomes malformed.
 *
 * When escape is needed we prefix `^FH_` and hex-encode `^`, `~`, and the
 * delimiter `_` itself (so literal underscores in the payload survive).
 */
export function fdField(payload: string): string {
  if (!NEEDS_FH.test(payload)) return `^FD${payload}^FS`;
  const escaped = payload.replace(/[\^~_]/g, hex);
  return `^FH${FH_DELIM}^FD${escaped}^FS`;
}
