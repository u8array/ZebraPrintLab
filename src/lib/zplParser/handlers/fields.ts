import type { CustomFontMapping } from "../../../types/ObjectType";
import { FN_NUMBER_MAX, FN_NUMBER_MIN } from "../../../types/Variable";
import type { SerialProps } from "../../../registry/serial";
import type { ParserState } from "../context";
import { ciToEncoding, getDecoder, int, makeObj, readRotation } from "../helpers";
import type { Handler } from "../types";

/** Helpers the field family borrows from parseZPL.ts. flushField + the
 *  reverse-bg helpers stay there because they form the gravitational
 *  centre of the parser (epic #4 will pull them out separately); the
 *  field family just calls in. appendComment is shared with XA/XZ in
 *  parseZPL.ts so it lives there. */
export interface FieldHelpers {
  flushField: () => void;
  appendComment: Handler;
}

/** Handlers for field-shaping commands: positioning (FO/FT), text
 *  setup (A0, A@, TB, CF, FW, FB, FH), field lifecycle (FD/FS),
 *  reverse + offset (LR/FR/LH/LT), serialisation (SN/SF), template
 *  hooks (FN/FC/FE), encoding (CI), comments (FX), and font alias
 *  registration (CW). Mutates the per-field caching slice on
 *  `ParserState` plus the shared `labelConfig` via `s.result`. */
export function createFieldHandlers(
  s: ParserState,
  helpers: FieldHelpers,
): Record<string, Handler> {
  const { flushField, appendComment } = helpers;
  const { labelConfig } = s.result;

  return {
    // ── Field origin ──────────────────────────────────────────────────────
    FO(p) {
      flushField();
      s.field.frActive = false;
      s.field.x = int(p[0]) + s.label.lhX;
      s.field.y = int(p[1]) + s.label.lhY + s.label.ltY;
      // 3rd param is justification (0/1/2) — stored but not actively used.
      s.field.positionIsFT = false;
    },
    FT(p) {
      flushField();
      s.field.frActive = false;
      s.field.x = int(p[0]) + s.label.lhX;
      s.field.y = int(p[1]) + s.label.lhY + s.label.ltY;
      s.field.positionIsFT = true;
    },

    // ── Text ──────────────────────────────────────────────────────────────
    // ^A0{rotation},{height},{width}  e.g. ^A0N,30,0
    A0(p, rest) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = int(p[1], s.defaults.cfHeight || 30);
      s.field.textW = int(p[2], s.defaults.cfWidth || 0);
      // Set fontId="0" only when the current ^CF is not already 0 —
      // otherwise the field is just repeating the label default, and
      // we keep fontId undefined so the model says "use the default".
      // When no ^CF has fired, "0" is the historical baseline both the
      // generator and the printer fall back to, so it counts as default.
      s.field.pendingFontId = s.defaults.cfFontId && s.defaults.cfFontId !== "0" ? "0" : undefined;
    },

    // ── Change alphanumeric default font ──────────────────────────────────
    // ^CF{font},{height},{width}  → sets default for fields without ^A
    CF(p) {
      const fontId = (p[0] ?? "").trim();
      const explicitHeight = parseInt(p[1] ?? "", 10);
      const explicitWidth = parseInt(p[2] ?? "", 10);
      s.defaults.cfHeight = isNaN(explicitHeight) ? s.defaults.cfHeight : explicitHeight;
      s.defaults.cfWidth = isNaN(explicitWidth) ? s.defaults.cfWidth : explicitWidth;
      if (fontId) {
        labelConfig.defaultFontId = fontId;
        s.defaults.cfFontId = fontId;
      }
      if (!isNaN(explicitHeight) && explicitHeight > 0) {
        labelConfig.defaultFontHeight = explicitHeight;
      }
      if (!isNaN(explicitWidth) && explicitWidth >= 0) {
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
      s.defaults.fbWidth = int(p[0], 0);
      s.defaults.fbLines = int(p[1], 1);
      s.defaults.fbSpacing = int(p[2], 0);
      const fbJ = (p[3] ?? "L").toUpperCase();
      s.defaults.fbJustify = fbJ === "C" || fbJ === "R" || fbJ === "J" ? fbJ : "L";
      // ^FB also implies text if no ^A was specified.
      if (!s.field.fieldType) {
        s.field.fieldType = "text";
        s.field.textH = s.defaults.cfHeight || 30;
        s.field.textW = s.defaults.cfWidth || 0;
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
      // Implicit text field: ^FD without a prior ^A uses ^CF defaults.
      // Skip the implicit promotion when s.comment.fnNumber is set — that means
      // we're looking at a bare `^FN<n>^FD<default>^FS` Variable
      // declaration (the docs-example form for ^FE inline embeds),
      // which flushField then routes through the bare-declaration
      // path (no field object, just Variable registration).
      if (!s.field.fieldType && s.comment.fnNumber === null) {
        s.field.fieldType = "text";
        s.field.textH = s.defaults.cfHeight || 30;
        s.field.textW = s.defaults.cfWidth || 0;
        s.field.textRot = s.defaults.fwRotation;
      }
      s.field.pendingFD = rest;
    },
    FS() {
      flushField();
      s.format.fhActive = false;
      s.field.positionIsFT = false;
    },

    // ── Serialization ─────────────────────────────────────────────────────
    SN(p) {
      // ^SN{start},{increment},{leadZero}
      // Appears AFTER the ^FD for this field — upgrade the last text
      // object to serial.
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
      // ^SF{increment},{padDigits},{leadZero}
      // Appears BEFORE ^FD — set pending state so flushField creates serial.
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

    // ── Label home (origin offset) ────────────────────────────────────────
    LH(p) {
      s.label.lhX = int(p[0], 0);
      s.label.lhY = int(p[1], 0);
    },

    // ── Label top (vertical offset) ───────────────────────────────────────
    LT(_, rest) {
      s.label.ltY = int(rest, 0);
    },

    // ^CW {alias},{path} — register an alias for a printer-resident font.
    // Subsequent ^A{alias} fields resolve to {path} via the s.fonts.aliases
    // map. The mapping is also persisted on labelConfig so the generator
    // can re-emit it on round-trip. Upsert by alias mirrors the
    // Map-set semantics of s.fonts.aliases: a later ^CW for the same alias
    // replaces the earlier mapping rather than accumulating duplicates.
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
        // The bytes already shipped via ~DY earlier in the stream;
        // surface that intent on the model so re-emit will ~DY again.
        entry.embedInZpl = true;
        // The fontCache key is the filename portion of the path
        // (drive prefix stripped), matching how ~DY registers fonts.
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
      s.field.textH = int(p[1]) || s.defaults.cfHeight || 30;
      s.field.textW = int(p[2]) || s.defaults.cfWidth || 0;
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
      const tbW = int(p[1], 0);
      const tbH = int(p[2], 0);
      s.field.textH = s.defaults.cfHeight || 30;
      s.field.textW = s.defaults.cfWidth || 0;
      if (tbW > 0) {
        s.defaults.fbWidth = tbW;
        s.defaults.fbLines = tbH > 0 ? Math.floor(tbH / (s.field.textH || 30)) : 1;
        s.defaults.fbJustify = "L";
      }
    },

    // ^FX: comment field — accumulate across consecutive ^FX lines so
    // the assembled text reaches the next field object as one multi-line
    // comment. Shares the implementation with the XA/XZ resetComment
    // path via the passed-in helper.
    FX: appendComment,

    // ^CI N: character set / encoding for ^FH byte decoding. Mapped to a
    // TextDecoder; unsupported variants (UTF-16/32, code page 850) keep the
    // current decoder and surface as a partial import.
    CI(p) {
      const enc = ciToEncoding(int(p[0]));
      s.format.fhDecoder = getDecoder(enc.label);
      if (!enc.supported) s.result.partialCmds.add(`^CI${int(p[0])}`);
    },

    // ^FN{n}: declares that the next field is a template slot. The
    // accompanying ^FD payload becomes the slot's default value at
    // flushField time. Out-of-range numbers (Zebra accepts 0/100+ on
    // newer firmware, but our model caps at 99) are ignored so they
    // don't poison the binding.
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
  };
}
