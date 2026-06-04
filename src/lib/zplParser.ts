import { DEFAULT_CLOCK_CHARS } from "./fcTemplate";
import { ZPL_BUILTIN_FONT_LETTERS } from "./customFonts";
import { isMuDpi } from "../types/LabelConfig";
import { tokenize, intDots, readRotation } from "./zplParser/helpers";
import {
  createParserState,
  getDefaultTextH,
  getDefaultTextW,
} from "./zplParser/context";
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

/** Parse a ZPL II byte stream into an editable design model. */
export function parseZPL(zpl: string, dpmm = 8): ParsedZPL {
  const s = createParserState();
  const tokens = tokenize(zpl, s.format);
  const {
    objects, labelConfig, printerProfile, variables,
    skipped, partialCmds, browserLimit, unknown,
  } = s.result;

  const takeComment = (): string | undefined => {
    const c = s.comment.pending;
    s.comment.pending = undefined;
    return c;
  };

  const graphicsFamily = createGraphicsHandlers(s, takeComment);
  const { commitPendingReverseBg, getReverseFlag } = graphicsFamily.helpers;
  const flushField = createFlushField(s, {
    commitPendingReverseBg,
    getReverseFlag,
    takeComment,
  });

  const resetComment: Handler = (_, rest) => {
    s.comment.pending = rest.trim() || undefined;
  };
  // Multi-line ^FX before a field accumulate; XA/XZ reset at label boundaries.
  const appendComment: Handler = (_, rest) => {
    const next = rest.trim();
    if (!next) return;
    s.comment.pending = s.comment.pending ? `${s.comment.pending}\n${next}` : next;
  };

  const handlers: Record<string, Handler> = {
    XA: (p, rest) => {
      commitPendingReverseBg();
      s.format.embedChar = "#";
      s.format.clockChars = { ...DEFAULT_CLOCK_CHARS };
      resetComment(p, rest);
    },
    XZ(_, rest) {
      commitPendingReverseBg();
      resetComment(_, rest);
    },
    // a-slot scales dot-quantities on read so the model stays
    // dots-canonical. b/c persist for re-emit; printer does the
    // resampling at print time. Spec: ^MU carries field-by-field
    // until overridden, so no ^XA reset; per-block isolation comes
    // from zplImportService.
    MU(p) {
      const a = (p[0] ?? "").trim().toUpperCase();
      if (a === "I") s.format.unitScale = dpmm * 25.4;
      else if (a === "M") s.format.unitScale = dpmm;
      else if (a === "" || a === "D") s.format.unitScale = 1;
      else {
        s.format.unitScale = 1;
        s.result.partialCmds.add("^MU");
      }
      const rawB = (p[1] ?? "").trim();
      const rawC = (p[2] ?? "").trim();
      if (rawB) {
        const b = Number.parseInt(rawB, 10);
        if (isMuDpi(b)) labelConfig.formatDpi = b;
        else s.result.partialCmds.add("^MU");
      }
      if (rawC) {
        const c = Number.parseInt(rawC, 10);
        if (isMuDpi(c)) labelConfig.outputDpi = c;
        else s.result.partialCmds.add("^MU");
      }
    },
  };

  Object.assign(handlers, createBarcodeHandlers(s.field, s.defaults, s.format));
  Object.assign(handlers, createFieldHandlers(s, { flushField, appendComment }));
  Object.assign(handlers, graphicsFamily.handlers);
  Object.assign(handlers, createSetupScriptHandlers(printerProfile));
  Object.assign(handlers, createLabelConfigHandlers(labelConfig, dpmm, s.format));
  Object.assign(handlers, createUnsupportedHandlers(s.result));

  for (const { cmd, rest } of tokens) {
    const p = rest.split(s.format.delimiterChar);
    const handler = handlers[cmd];
    if (handler) {
      handler(p, rest);
      continue;
    }

    // ^A{font}{rotation},{height},{width} — dynamic font (A0/A@ are static-mapped).
    if (cmd[0] === "A" && cmd.length === 2) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = intDots(p[1], s.format.unitScale, getDefaultTextH(s.defaults));
      s.field.textW = intDots(p[2], s.format.unitScale, getDefaultTextW(s.defaults));
      const fontChar = cmd[1] ?? "";
      // Round-trip: ^A{id} matching the active ^CF drops to "use default"
      // (no pendingFontId) so re-emit stays terse; otherwise pin the alias.
      if (s.defaults.cfFontId && fontChar === s.defaults.cfFontId) {
        s.field.pendingFontId = undefined;
      } else {
        s.field.pendingFontId = fontChar;
      }
      if (
        !s.fonts.aliases.has(fontChar) &&
        !ZPL_BUILTIN_FONT_LETTERS.includes(fontChar)
      ) {
        partialCmds.add(`^${cmd}`);
      }
      continue;
    }

    if (rest.trim() || cmd.trim()) {
      const token = `^${cmd}${rest}`;
      skipped.push(token);
      unknown.push(token);
    }
  }

  // pageIndex stays 0; zplImportService fills it per ^XA…^XZ block.
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
