import type { LabelConfig } from "../../../types/ObjectType";
import {
  DARKNESS_INSTANT_RANGE,
  DARKNESS_PERMANENT_RANGE,
  MAX_LABEL_LENGTH_RANGE,
  SPEED_RANGE,
  isMediaFeedMode,
  isMediaMode,
  isMediaTracking,
  isMediaType,
  isPrintOrientation,
} from "../../../types/ObjectType";
import { parseIntOrUndef } from "../../inputParse";
import { inRange, int, strParam } from "../helpers";
import type { Handler } from "../types";

/** ^PQ extended params (pauseCount, replicates) — Zebra spec caps at
 *  8 digits / 99,999,999 per slot. */
const PQ_EXT_MAX = 99_999_999;

/** Per-label media + print-quality handlers — every entry mutates
 *  only the `labelConfig` slice. ^PW / ^LL (dots → mm using `dpmm`),
 *  ^PQ / ^MM / ^LS / ^PR / ^MD / ^MT / ^MN / ^ML / ^MF / ^XB / ^PO /
 *  ^PM / ~SD. */
export function createLabelConfigHandlers(
  labelConfig: Partial<LabelConfig>,
  dpmm: number,
): Record<string, Handler> {
  return {
    PW(_, rest) {
      const dots = int(rest);
      if (dots > 0) labelConfig.widthMm = Math.round((dots / dpmm) * 10) / 10;
    },
    LL(_, rest) {
      const dots = int(rest);
      if (dots > 0) labelConfig.heightMm = Math.round((dots / dpmm) * 10) / 10;
    },
    PQ(p) {
      const qty = int(p[0], 0);
      if (qty > 0) labelConfig.printQuantity = qty;
      // ^PQ q,p,r,o — preserve extended params when present.
      if (p.length > 1) {
        const pause = int(p[1], 0);
        if (pause >= 0 && pause <= PQ_EXT_MAX) labelConfig.pauseCount = pause;
      }
      if (p.length > 2) {
        const reps = int(p[2], 0);
        if (reps >= 0 && reps <= PQ_EXT_MAX) labelConfig.replicates = reps;
      }
      if (p.length > 3) {
        const o = (p[3] ?? "").toUpperCase();
        if (o === "Y" || o === "N") labelConfig.overridePauseCount = o;
      }
    },
    MM(_, rest) {
      // `.trim()` before `[0]` so a stray leading whitespace in the
      // input (rare but seen with hand-edited ZPL) does not eat the
      // mode character. Applies to all single-char enum handlers
      // below (MT / PO / PM).
      const mode = (rest.trim()[0] ?? "").toUpperCase();
      if (isMediaMode(mode)) labelConfig.mediaMode = mode;
    },
    LS(_, rest) {
      const shift = int(rest, 0);
      if (shift !== 0) labelConfig.labelShift = shift;
    },
    PR(p) {
      const print = inRange(parseIntOrUndef(p[0]), SPEED_RANGE);
      if (print !== undefined) labelConfig.printSpeed = print;
      const slew = inRange(parseIntOrUndef(p[1]), SPEED_RANGE);
      if (slew !== undefined) labelConfig.slewSpeed = slew;
      const bf = inRange(parseIntOrUndef(p[2]), SPEED_RANGE);
      if (bf !== undefined) labelConfig.backfeedSpeed = bf;
    },
    MD(_, rest) {
      const v = inRange(parseIntOrUndef(rest), DARKNESS_PERMANENT_RANGE);
      if (v !== undefined) labelConfig.darkness = v;
    },
    MT(_, rest) {
      const mt = (rest.trim()[0] ?? "").toUpperCase();
      if (isMediaType(mt)) labelConfig.mediaType = mt;
    },
    MN(p) {
      // ^MNa,b — b is an optional black-mark offset for W/M modes,
      // which we don't model. Reading p[0] instead of the raw rest
      // string keeps `^MNY,10` from being mis-read as the single
      // token "Y,10" and silently dropped.
      const v = strParam(p[0]);
      if (isMediaTracking(v)) labelConfig.mediaTracking = v;
    },
    ML(p) {
      const v = inRange(parseIntOrUndef(p[0]), MAX_LABEL_LENGTH_RANGE);
      if (v !== undefined) labelConfig.maxLabelLength = v;
    },
    MF(p) {
      const p1 = strParam(p[0]);
      const p2 = strParam(p[1]);
      if (isMediaFeedMode(p1)) labelConfig.mediaFeedPowerUp = p1;
      if (isMediaFeedMode(p2)) labelConfig.mediaFeedHeadClose = p2;
    },
    XB() {
      labelConfig.suppressBackfeed = true;
    },
    PO(_, rest) {
      const po = (rest.trim()[0] ?? "").toUpperCase();
      if (isPrintOrientation(po)) labelConfig.printOrientation = po;
    },
    PM(_, rest) {
      const m = (rest.trim()[0] ?? "").toUpperCase();
      if (m === "Y" || m === "N") labelConfig.mirror = m;
    },
    // ~SD — instant darkness set (00..30). Tilde-prefix; the tokenizer
    // drops the delimiter, so this is the canonical SD handler.
    SD(_, rest) {
      const v = inRange(parseIntOrUndef(rest), DARKNESS_INSTANT_RANGE);
      if (v !== undefined) labelConfig.instantDarkness = v;
    },
  };
}
