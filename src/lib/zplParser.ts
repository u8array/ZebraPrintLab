import { DEFAULT_CLOCK_CHARS } from "./fcTemplate";
import { ZPL_BUILTIN_FONT_LETTERS } from "./customFonts";
import { tokenize, int, readRotation } from "./zplParser/helpers";
import { createParserState } from "./zplParser/context";
import { createFlushField } from "./zplParser/flushField";
import { createBarcodeHandlers } from "./zplParser/handlers/barcodes";
import { createFieldHandlers } from "./zplParser/handlers/fields";
import { createGraphicsHandlers } from "./zplParser/handlers/graphics";
import { createLabelConfigHandlers } from "./zplParser/handlers/labelConfig";
import { createSetupScriptHandlers } from "./zplParser/handlers/setupScript";
import { createUnsupportedHandlers } from "./zplParser/handlers/unsupported";
import type {
  Handler,
  ImportFinding,
  ParsedZPL,
} from "./zplParser/types";
export type {
  ImportFindingKind,
  ImportFinding,
  ImportReport,
  ParsedZPL,
} from "./zplParser/types";

export function parseZPL(zpl: string, dpmm = 8): ParsedZPL {
  const tokens = tokenize(zpl);
  const s = createParserState();
  // Destructured references for sub-state objects whose internal
  // mutations don't need `s.` qualification. Reads via `s.foo` for
  // primitives only; collection references stay bare for terseness.
  // Destructured aliases for high-frequency collection refs so the
  // inline body keeps reading naturally. Primitives stay on `s.foo`
  // (rebound writes need that). The three Map/Set collections that
  // also count as state mutate via method calls so they read cleanest
  // via `s.fontAliases.get(...)` etc — kept on `s.` for consistency.
  const {
    objects, labelConfig, printerProfile, variables,
    skipped, partialCmds, browserLimit, unknown,
  } = s;

  /** Consume and return the pending ^FX comment, then clear it.
   *  Lives at the parseZPL level (not inside any family factory) so
   *  both the graphics family and flushField can take it as a peer
   *  dependency without a build-order constraint. */
  const takeComment = (): string | undefined => {
    const c = s.pendingComment;
    s.pendingComment = undefined;
    return c;
  };

  // Graphics family owns the GB / GC / GD / GE / GF / GS / XG / ~DY
  // handlers and the reverse-text background collapse protocol
  // (`pushGBObject` + `commitPendingReverseBg` + `getReverseFlag`).
  const graphicsFamily = createGraphicsHandlers(s, takeComment);
  const { commitPendingReverseBg, getReverseFlag } = graphicsFamily.helpers;

  // flushField depends on both takeComment and the graphics-family
  // reverse-bg helpers, so it builds last.
  const flushField = createFlushField(s, {
    commitPendingReverseBg,
    getReverseFlag,
    takeComment,
  });

  // ── Command handler map ────────────────────────────────────────────────────
  const resetComment: Handler = (_, rest) => {
    s.pendingComment = rest.trim() || undefined;
  };
  // Hand-written ZPL often splits a logical comment across several `^FX` lines
  // before the field they describe. Accumulate them so each line survives on
  // the imported object's comment field; XA/XZ still reset at label boundaries.
  const appendComment: Handler = (_, rest) => {
    const next = rest.trim();
    if (!next) return;
    s.pendingComment = s.pendingComment ? `${s.pendingComment}\n${next}` : next;
  };

  const handlers: Record<string, Handler> = {
    // ── Label dimensions ────────────────────────────────────────────────────
    // PW / LL — extracted to handlers/labelConfig.ts (need dpmm).

    // ── Field family — extracted to handlers/fields.ts.
    // FO, FT, A0, A@, TB, CF, FW, FB, FH, FD, FS, SN, SF, LR, FR,
    // LH, LT, CW, FX, CI, FN, FC, FE.

    // ── Barcode defaults + all ^B* — extracted to handlers/barcodes.ts.
    // BY, BC, B3, BE, BU, B8, B9, B2, BA, B1, BI, BJ, BK, BL, BP, B5,
    // BZ, BS, B4, BM, BR, BQ, BX, B7, B0, BO, BV, BF, BB.

    // ── Graphics ────────────────────────────────────────────────────────────
    // GB, GC, GD, GE, GF, GS, XG, ~DY — extracted to handlers/graphics.ts.
    // The family also owns `pushGBObject` + `commitPendingReverseBg`
    // (used by flushField above via the destructured helpers).

    // ── Ignored / structural ────────────────────────────────────────────────
    // ^XA / ^XZ: label start/end. Reset format-scoped directives so a
    // multi-label stream doesn't leak ^FE/^FC overrides from a prior
    // ^XA…^XZ block into the next one — without this `^FC@^...^XZ^XA`
    // would parse later default-char tokens differently.
    XA: (p, rest) => {
      // Defensive: flush any stash that survived a malformed prior
      // label (missing ^XZ) so it doesn't bleed into the new block.
      commitPendingReverseBg();
      s.embedChar = "#";
      s.clockChars = { ...DEFAULT_CLOCK_CHARS };
      resetComment(p, rest);
    },
    XZ(_, rest) {
      // Flush any orphan reverse-bg before the label boundary so it
      // doesn't leak across labels in a multi-label stream.
      commitPendingReverseBg();
      resetComment(_, rest);
    },
    // FV / FM / FP / JA / JM / JC / JD / JE / JI / JR / JS / JU / PP —
    // noops; FL / HT / LF / IM / ~DG — browser-limit factories. All
    // extracted to handlers/unsupported.ts.
  };

  Object.assign(handlers, createBarcodeHandlers(s));
  Object.assign(handlers, createFieldHandlers(s, labelConfig, { flushField, appendComment }));
  Object.assign(handlers, graphicsFamily.handlers);
  Object.assign(handlers, createSetupScriptHandlers(printerProfile));
  Object.assign(handlers, createLabelConfigHandlers(labelConfig, dpmm));
  Object.assign(handlers, createUnsupportedHandlers({ skipped, browserLimit }));

  // ── Main dispatch loop ─────────────────────────────────────────────────────
  for (const { cmd, rest } of tokens) {
    const p = rest.split(",");
    const handler = handlers[cmd];
    if (handler) {
      handler(p, rest);
      continue;
    }

    // ^A{font}{rotation},{height},{width} — general font command (A0 and A@ are in the map;
    // remaining ^A* variants are dynamic keys that cannot be static map entries).
    if (cmd[0] === "A" && cmd.length === 2) {
      s.fieldType = "text";
      s.textRot = readRotation(rest[0], s.fwRotation);
      s.textH = int(p[1], s.cfHeight || 30);
      s.textW = int(p[2], s.cfWidth || 0);
      const fontChar = cmd[1] ?? "";
      // Round-trip semantics: when the font character matches the
      // current ^CF, treat the field as "use the label default" and
      // leave s.pendingFontId undefined so the model carries no per-field
      // override. Otherwise pin the alias on the field so re-emitting
      // produces the same ^A{id} short form. Unknown aliases (no ^CW
      // and not a built-in) still go through — the printer would fall
      // back to font 0 at print, but storing the user's choice keeps
      // the import lossless for editing.
      if (s.cfFontId && fontChar === s.cfFontId) {
        s.pendingFontId = undefined;
      } else {
        s.pendingFontId = fontChar;
      }
      if (
        !s.fontAliases.has(fontChar) &&
        !ZPL_BUILTIN_FONT_LETTERS.includes(fontChar)
      ) {
        partialCmds.add(`^${cmd}`);
      }
      continue;
    }

    // Record unknown commands (excluding pure whitespace tokens)
    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  // Build findings list. `partialCmds` is deduplicated by command code;
  // the others are per-occurrence in encounter order. pageIndex stays 0
  // here; `zplImportService.importZplText` fills it once it knows which
  // ^XA…^XZ block this came from.
  const findings: ImportFinding[] = [
    ...[...partialCmds].map(
      (command): ImportFinding => ({ kind: "partial", command, pageIndex: 0 }),
    ),
    ...browserLimit.map(
      (command): ImportFinding => ({
        kind: "browserLimit",
        command,
        pageIndex: 0,
      }),
    ),
    ...unknown.map(
      (command): ImportFinding => ({ kind: "unknown", command, pageIndex: 0 }),
    ),
  ];

  return {
    labelConfig,
    printerProfile,
    objects,
    variables,
    skipped,
    importReport: {
      findings,
      partial: [...partialCmds],
      browserLimit,
      unknown,
    },
  };
}
