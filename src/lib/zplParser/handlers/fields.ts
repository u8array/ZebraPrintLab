import type { CustomFontMapping } from "../../../types/LabelConfig";
import { FN_NUMBER_MAX, FN_NUMBER_MIN } from "../../../types/Variable";
import type { SerialProps } from "../../../registry/serial";
import { ZPL_BUILTIN_FONT_LETTERS } from "../../customFonts";
import { getDefaultTextH, getDefaultTextW, type ParserState } from "../context";
import { ciToEncoding, dotsFor, getDecoder, int, makeObj, readRotation } from "../helpers";
import type { Handler, Wildcard } from "../types";

/** flushField + appendComment are shared with the orchestrator. */
export interface FieldHelpers {
  flushField: () => void;
  appendComment: Handler;
}

/** ^A{font}{rotation},{height},{width}: dynamic font (A0/A@ are
 *  static-mapped). Registered as a `Wildcard` because the font char
 *  is the variable part of the command name. */
export function createDynamicFontAWildcard(s: ParserState): Wildcard {
  const { dots } = dotsFor(s);
  return {
    matches: (cmd) => cmd.length === 2 && cmd[0] === "A",
    handle: (p, rest, cmd) => {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = dots(p[1], getDefaultTextH(s.defaults));
      s.field.textW = dots(p[2], getDefaultTextW(s.defaults));
      const fontChar = cmd[1] ?? "";
      // Round-trip: ^A{id} matching the active ^CF drops to "use
      // default" (no pendingFontId) so re-emit stays terse; otherwise
      // pin the alias.
      if (s.defaults.cfFontId && fontChar === s.defaults.cfFontId) {
        s.field.pendingFontId = undefined;
      } else {
        s.field.pendingFontId = fontChar;
      }
      if (
        !s.fonts.aliases.has(fontChar) &&
        !ZPL_BUILTIN_FONT_LETTERS.includes(fontChar)
      ) {
        s.result.partialCmds.add(`^${cmd}`);
      }
    },
  };
}

/** Field-shaping commands: FO/FT, A0/A@, TB, CF, FW, FB, FH, FD/FS,
 *  LR/FR, LH/LT, SN/SF, FN/FC/FE, CI, FX, CW. */
export function createFieldHandlers(
  s: ParserState,
  helpers: FieldHelpers,
): Record<string, Handler> {
  const { flushField, appendComment } = helpers;
  const { labelConfig } = s.result;
  const { dots, dotsOrUndef } = dotsFor(s);

  return {
    // ── Field origin ──────────────────────────────────────────────────────
    FO(p) {
      flushField();
      s.field.x = dots(p[0]) + s.label.lhX;
      s.field.y = dots(p[1]) + s.label.lhY + s.label.ltY;
      // 3rd param is justification (0/1/2) — stored but not actively used.
      s.field.positionIsFT = false;
    },
    FT(p) {
      flushField();
      s.field.x = dots(p[0]) + s.label.lhX;
      s.field.y = dots(p[1]) + s.label.lhY + s.label.ltY;
      s.field.positionIsFT = true;
    },

    // ── Text ──────────────────────────────────────────────────────────────
    // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
    A0(p, rest) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = dots(p[1], getDefaultTextH(s.defaults));
      s.field.textW = dots(p[2], getDefaultTextW(s.defaults));
      // fontId "0" only when ^CF differs; "0" is the implicit default otherwise.
      s.field.pendingFontId = s.defaults.cfFontId && s.defaults.cfFontId !== "0" ? "0" : undefined;
    },

    // ── Change alphanumeric default font ──────────────────────────────────
    // ^CF{font},{height},{width}  → sets default for fields without ^A
    CF(p) {
      const fontId = (p[0] ?? "").trim();
      const explicitHeight = dotsOrUndef(p[1]);
      const explicitWidth = dotsOrUndef(p[2]);
      if (explicitHeight !== undefined) s.defaults.cfHeight = explicitHeight;
      if (explicitWidth !== undefined) s.defaults.cfWidth = explicitWidth;
      if (fontId) {
        labelConfig.defaultFontId = fontId;
        s.defaults.cfFontId = fontId;
      }
      if (explicitHeight !== undefined && explicitHeight > 0) {
        labelConfig.defaultFontHeight = explicitHeight;
      }
      if (explicitWidth !== undefined && explicitWidth >= 0) {
        labelConfig.defaultFontWidth = explicitWidth;
      }
    },

    // ── Field-wide default rotation ───────────────────────────────────────
    // ^FW{rotation}  e.g. ^FWR
    FW(_, rest) {
      const fw = (rest[0] ?? "N").toUpperCase();
      if (fw === "N" || fw === "R" || fw === "I" || fw === "B") {
        s.defaults.fwRotation = fw;
      }
    },

    // ── Field block ───────────────────────────────────────────────────────
    // ^FB{width},{lines},{lineSpacing},{justify},{hangingIndent}
    FB(p) {
      s.defaults.fbWidth = dots(p[0]);
      s.defaults.fbLines = int(p[1], 1);
      s.defaults.fbSpacing = dots(p[2]);
      const fbJ = (p[3] ?? "L").toUpperCase();
      s.defaults.fbJustify = fbJ === "C" || fbJ === "R" || fbJ === "J" ? fbJ : "L";
      // ^FB also implies text if no ^A was specified.
      if (!s.field.fieldType) {
        s.field.fieldType = "text";
        s.field.textH = getDefaultTextH(s.defaults);
        s.field.textW = getDefaultTextW(s.defaults);
        s.field.textRot = s.defaults.fwRotation;
      }
    },

    // ── Field hex indicator ───────────────────────────────────────────────
    FH(_, rest) {
      s.format.fhActive = true;
      s.format.fhDelimiter = rest[0] ?? "_";
    },

    // ── Field data / separator ────────────────────────────────────────────
    FD(_, rest) {
      // Implicit text field unless we're inside a bare `^FN^FD^FS` declaration.
      if (!s.field.fieldType && s.comment.fnNumber === null) {
        s.field.fieldType = "text";
        s.field.textH = getDefaultTextH(s.defaults);
        s.field.textW = getDefaultTextW(s.defaults);
        s.field.textRot = s.defaults.fwRotation;
      }
      s.field.pendingFD = rest;
    },
    FS() {
      flushField();
      s.format.fhActive = false;
      s.field.positionIsFT = false;
      // Drop any per-field pending state that flushField left intact.
      // Each of these binds only to the field this ^FS closes; without
      // an explicit reset at the boundary a bare ^XX^FS (no ^FD) would
      // leak the pending value into the next real field.
      s.field.snPending = false;
      s.field.snIncrement = 1;
      s.field.snMode = "SN";
      s.field.pendingPrinterFontName = undefined;
      s.field.pendingFontId = undefined;
      s.field.frActive = false;
      s.field.fpDirection = "H";
      s.field.fpCharGap = 0;
      s.defaults.fbWidth = 0;
      s.defaults.fbLines = 1;
      s.defaults.fbSpacing = 0;
      s.defaults.fbJustify = "L";
      s.comment.fnNumber = null;
      s.comment.fnComment = undefined;
    },

    // ── Serialization ─────────────────────────────────────────────────────
    SN(p) {
      // ^SN{start},{increment},{leadZero} — runs after ^FD; upgrade last text to serial.
      const snStart = p[0] ?? "";
      const snInc = int(p[1], 1);
      const lastObj = s.result.objects[s.result.objects.length - 1];
      if (lastObj && lastObj.type === "text") {
        const tp = lastObj.props;
        const serialObj = makeObj(
          "serial",
          lastObj.x,
          lastObj.y,
          {
            content: snStart || tp.content || "001",
            increment: snInc,
            fontHeight: tp.fontHeight ?? 30,
            fontWidth: tp.fontWidth ?? 0,
            rotation: tp.rotation ?? "N",
            zplMode: "SN",
          } satisfies SerialProps,
          lastObj.positionType,
          lastObj.comment,
        );
        s.result.objects[s.result.objects.length - 1] = serialObj;
      }
    },
    SF(p) {
      // ^SF{increment},{padDigits},{leadZero} — runs before ^FD; flushField emits serial.
      s.field.snPending = true;
      s.field.snIncrement = int(p[0], 1);
      s.field.snMode = "SF";
    },

    // ── Label reverse / field reverse ─────────────────────────────────────
    LR(_, rest) {
      s.label.lrActive = rest.toUpperCase().startsWith("Y");
    },
    FR() {
      s.field.frActive = true;
    },

    // ── Field-direction modifier (CJK vertical / RTL reverse) ─────────────
    // ^FP{d},{g}  d ∈ H|V|R, g = inter-char gap in dots (default 0).
    // Per-field; ^FS resets back to H/0. Gap is clamped to the spec's
    // 0..9999 range so a malformed import can't corrupt the prop.
    FP(p) {
      const d = (p[0] ?? "H").toUpperCase();
      s.field.fpDirection = d === "V" || d === "R" ? d : "H";
      s.field.fpCharGap = Math.max(0, Math.min(9999, dots(p[1])));
    },

    // ── Label home (origin offset) ────────────────────────────────────────
    LH(p) {
      s.label.lhX = dots(p[0]);
      s.label.lhY = dots(p[1]);
    },

    // ── Label top (vertical offset) ───────────────────────────────────────
    LT(_, rest) {
      s.label.ltY = dots(rest);
    },

    // ^CW {alias},{path} — register a printer-resident font alias.
    // Upsert: later ^CW for same alias replaces, no duplicates.
    CW(p) {
      const alias = (p[0] ?? "").trim().toUpperCase();
      const path = (p[1] ?? "").trim();
      if (!/^[A-Z0-9]$/.test(alias) || !path) return;
      s.fonts.aliases.set(alias, path);
      const list = (labelConfig.customFonts ?? []).filter(
        (m) => m.alias !== alias,
      );
      const entry: CustomFontMapping = { alias, path };
      if (s.fonts.downloadedFontPaths.has(path)) {
        // Bytes shipped via ~DY earlier; mark for re-emit and link the fontCache key.
        entry.embedInZpl = true;
        const colonIdx = path.indexOf(":");
        const filename = colonIdx >= 0 ? path.slice(colonIdx + 1) : path;
        if (filename) entry.previewFontName = filename;
      }
      labelConfig.customFonts = [...list, entry];
    },

    // ── TrueType font / text block ────────────────────────────────────────
    // ^A@{rotation},{height},{width},{drive}:{font} — TrueType font reference.
    // Can't load printer TrueType fonts; import as text with best-effort sizing.
    "A@"(p, rest) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = dots(p[1]) || getDefaultTextH(s.defaults);
      s.field.textW = dots(p[2]) || getDefaultTextW(s.defaults);
      const fontRef = p[3] ?? "";
      const colonIdx = fontRef.indexOf(":");
      s.field.pendingPrinterFontName =
        (colonIdx >= 0 ? fontRef.slice(colonIdx + 1) : fontRef) || undefined;
      s.result.partialCmds.add("^A@");
    },
    // ^TB{rotation},{width},{height} — text block (alternative to ^A + ^FB)
    TB(p, rest) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      const tbW = dots(p[1]);
      const tbH = dots(p[2]);
      s.field.textH = getDefaultTextH(s.defaults);
      s.field.textW = getDefaultTextW(s.defaults);
      if (tbW > 0) {
        s.defaults.fbWidth = tbW;
        s.defaults.fbLines = tbH > 0 ? Math.floor(tbH / (s.field.textH || 30)) : 1;
        s.defaults.fbJustify = "L";
      }
    },

    FX: appendComment,

    // ^CI N: character set / encoding for ^FH byte decoding. Mapped to a
    // TextDecoder; unsupported variants (UTF-16/32, code page 850) keep the
    // current decoder and surface as a partial import.
    CI(p) {
      const enc = ciToEncoding(int(p[0]));
      s.format.fhDecoder = getDecoder(enc.label);
      if (!enc.supported) s.result.partialCmds.add(`^CI${int(p[0])}`);
    },

    // ^FN{n}: template slot for the next field's ^FD default. Out-of-range ignored.
    FN(p) {
      const n = int(p[0]);
      if (n < FN_NUMBER_MIN || n > FN_NUMBER_MAX) {
        s.result.partialCmds.add("^FN");
        return;
      }
      s.comment.fnNumber = n;
      s.comment.fnComment = s.comment.pending;
    },
    FC(p) {
      // ^FC<a>,<b>,<c>: redefine clock chars. Missing/empty slots
      // keep their current value (Zebra spec: defaults persist when
      // a parameter is omitted). `^` and `~` stay reserved.
      const accept = (raw: string | undefined, current: string) => {
        const c = raw?.[0];
        return c && c !== "^" && c !== "~" ? c : current;
      };
      s.format.clockChars = {
        date: accept(p[0], s.format.clockChars.date),
        time: accept(p[1], s.format.clockChars.time),
        tertiary: accept(p[2], s.format.clockChars.tertiary),
      };
    },
    FE(p) {
      // ^FE<char>: redefine the FN-embed delimiter used inside ^FD/^FV.
      // Single ASCII character; falls back to '#' when missing/invalid.
      const c = p[0]?.[0];
      s.format.embedChar = c && c !== "^" && c !== "~" ? c : "#";
    },

    // ^CC<char> / ~CC<char>: change the command prefix char (default ^).
    // The tokenizer reads s.format.caretChar live, so the next command in
    // the stream uses the new prefix. Reject chars that would collapse
    // a role boundary (tilde, delimiter) and end up parsing nothing.
    CC(_, rest) {
      const c = rest[0];
      if (!c || c <= " " || c === "\x7F" || c === s.format.tildeChar || c === s.format.delimiterChar) {
        s.result.partialCmds.add("^CC");
        return;
      }
      s.format.caretChar = c;
    },
    // ^CT<char> / ~CT<char>: change the tilde-form prefix (default ~).
    CT(_, rest) {
      const c = rest[0];
      if (!c || c <= " " || c === "\x7F" || c === s.format.caretChar || c === s.format.delimiterChar) {
        s.result.partialCmds.add("^CT");
        return;
      }
      s.format.tildeChar = c;
    },
    // ^CD<char> / ~CD<char>: change the parameter delimiter (default ,).
    CD(_, rest) {
      const c = rest[0];
      if (!c || c <= " " || c === "\x7F" || c === s.format.caretChar || c === s.format.tildeChar) {
        s.result.partialCmds.add("^CD");
        return;
      }
      s.format.delimiterChar = c;
    },
  };
}
