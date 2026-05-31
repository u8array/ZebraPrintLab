import { DEFAULT_CLOCK_CHARS } from "./fcTemplate";
import { ZPL_BUILTIN_FONT_LETTERS } from "./customFonts";
import { tokenize, int, readRotation } from "./zplParser/helpers";
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
  const tokens = tokenize(zpl);
  const s = createParserState();
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
  };

  Object.assign(handlers, createBarcodeHandlers(s.field, s.defaults));
  Object.assign(handlers, createFieldHandlers(s, { flushField, appendComment }));
  Object.assign(handlers, graphicsFamily.handlers);
  Object.assign(handlers, createSetupScriptHandlers(printerProfile));
  Object.assign(handlers, createLabelConfigHandlers(labelConfig, dpmm));
  Object.assign(handlers, createUnsupportedHandlers(s.result));

  for (const { cmd, rest } of tokens) {
    const p = rest.split(",");
    const handler = handlers[cmd];
    if (handler) {
      handler(p, rest);
      continue;
    }

    // ^A{font}{rotation},{height},{width} — dynamic font (A0/A@ are static-mapped).
    if (cmd[0] === "A" && cmd.length === 2) {
      s.field.fieldType = "text";
      s.field.textRot = readRotation(rest[0], s.defaults.fwRotation);
      s.field.textH = int(p[1], getDefaultTextH(s.defaults));
      s.field.textW = int(p[2], getDefaultTextW(s.defaults));
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
