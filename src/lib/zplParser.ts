import { DEFAULT_CLOCK_CHARS } from "./fcTemplate";
import { tokenize } from "./zplParser/helpers";
import { createParserState } from "./zplParser/context";
import { createFlushField } from "./zplParser/flushField";
import { createBarcodeHandlers } from "./zplParser/handlers/barcodes";
import { createDynamicFontAWildcard, createFieldHandlers } from "./zplParser/handlers/fields";
import { createGraphicsHandlers } from "./zplParser/handlers/graphics";
import { createLabelConfigHandlers } from "./zplParser/handlers/labelConfig";
import { createSetupScriptHandlers } from "./zplParser/handlers/setupScript";
import { createUnitsHandler } from "./zplParser/handlers/units";
import { createUnsupportedHandlers } from "./zplParser/handlers/unsupported";
import type {
  Handler,
  ImportFinding,
  ParsedZPL,
  Wildcard,
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
    XA: (p, rest, cmd) => {
      commitPendingReverseBg();
      s.format.embedChar = "#";
      s.format.clockChars = { ...DEFAULT_CLOCK_CHARS };
      resetComment(p, rest, cmd);
    },
    XZ(p, rest, cmd) {
      commitPendingReverseBg();
      resetComment(p, rest, cmd);
    },
  };

  Object.assign(handlers, createBarcodeHandlers(s));
  Object.assign(handlers, createFieldHandlers(s, { flushField, appendComment }));
  Object.assign(handlers, graphicsFamily.handlers);
  Object.assign(handlers, createSetupScriptHandlers(s));
  Object.assign(handlers, createLabelConfigHandlers(s, dpmm));
  Object.assign(handlers, createUnitsHandler(s, dpmm));
  Object.assign(handlers, createUnsupportedHandlers(s.result));

  // Wildcard handlers are tried only after exact-match dispatch fails,
  // so a handler-table entry always wins over a pattern-match.
  const wildcards: Wildcard[] = [createDynamicFontAWildcard(s)];

  for (const { cmd, rest } of tokens) {
    const p = rest.split(s.format.delimiterChar);
    const handler = handlers[cmd] ?? wildcards.find((w) => w.matches(cmd))?.handle;
    if (handler) {
      handler(p, rest, cmd);
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
    uploadedFontPaths: [...s.fonts.downloadedFontPaths],
    referencedFontPaths: [...s.fonts.referencedFontPaths],
    skipped,
    importReport: {
      findings,
      partial: [...partialCmds],
      browserLimit,
      unknown,
    },
  };
}
