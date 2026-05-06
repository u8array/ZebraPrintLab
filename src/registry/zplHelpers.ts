import type { LabelObjectBase } from '../types/ObjectType';

/** Emit `^FT` or `^FO` depending on how the object was originally positioned. */
export function fieldPos(obj: LabelObjectBase): string {
  const cmd = obj.positionType === 'FT' ? 'FT' : 'FO';
  return `^${cmd}${obj.x},${obj.y}`;
}

const FH_DELIM = '_';
const NEEDS_FH = /[\^~]/;

function hex(ch: string): string {
  return FH_DELIM + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
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
