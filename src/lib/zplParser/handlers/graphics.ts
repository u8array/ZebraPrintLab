import type { BoxProps } from "../../../registry/box";
import type { EllipseProps } from "../../../registry/ellipse";
import type { ImageProps } from "../../../registry/image";
import type { LineProps } from "../../../registry/line";
import { loadFontBytesSync } from "../../fontCache";
import { formatStoragePath, parseStoragePath } from "../../storagePath";
import { getPosType, pushBrowserLimit, type ParserState } from "../context";
import { decodeGraphicToImage } from "../decoders/graphic";
import { int, makeObj, readColor, readRotation } from "../helpers";
import type { Handler } from "../types";

/** Characters of a `^GF`/`~DY` payload retained in browserLimit/skipped
 *  findings; rest is replaced with an ellipsis so a single multi-KB
 *  base64 blob doesn't drown out the import report. */
const IMPORT_FINDING_PAYLOAD_LIMIT = 80;

/** Helpers re-exported to parseZPL so flushField can drive reverse-bg collapse. */
export interface GraphicsExports {
  commitPendingReverseBg: () => void;
  pushGBObject: (
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    color: "B" | "W",
    rounding: number,
    reverseFlag: boolean | undefined,
    comment: string | undefined,
  ) => void;
  /** ^LR | ^FR; returns `undefined` (not `false`) when off. */
  getReverseFlag: () => boolean | undefined;
}

export interface GraphicsFamily {
  handlers: Record<string, Handler>;
  helpers: GraphicsExports;
}

/** Graphic primitives (^GB/^GC/^GD/^GE/^GF/^GS/^XG/~DY) + reverse-bg collapse. */
export function createGraphicsHandlers(
  s: ParserState,
  takeComment: () => string | undefined,
): GraphicsFamily {
  const getReverseFlag = () => s.label.lrActive || s.field.frActive || undefined;

  const pushGBObject: GraphicsExports["pushGBObject"] = (
    gx, gy, w, h, t, color, rounding, reverseFlag, comment,
  ) => {
    if (h === t && w > t) {
      s.result.objects.push(
        makeObj(
          "line",
          gx,
          gy,
          { angle: 0, length: w, thickness: t, color, reverse: reverseFlag } satisfies LineProps,
          undefined,
          comment,
        ),
      );
    } else if (w === t && h > t) {
      s.result.objects.push(
        makeObj(
          "line",
          gx,
          gy,
          { angle: 90, length: h, thickness: t, color, reverse: reverseFlag } satisfies LineProps,
          undefined,
          comment,
        ),
      );
    } else {
      const filled = t >= Math.min(w, h);
      s.result.objects.push(
        makeObj(
          "box",
          gx,
          gy,
          {
            width: w,
            height: h,
            thickness: t,
            filled,
            color,
            rounding,
            reverse: reverseFlag,
          } satisfies BoxProps,
          undefined,
          comment,
        ),
      );
    }
  };

  const commitPendingReverseBg = () => {
    if (!s.reverseBg) return;
    const bg = s.reverseBg;
    s.reverseBg = null;
    pushGBObject(bg.x, bg.y, bg.w, bg.h, bg.t, bg.color, bg.rounding, bg.reverseFlag, bg.comment);
  };

  const handlers: Record<string, Handler> = {
    GB(p) {
      // ^GB{w},{h},{t},{color},{rounding}
      // ZPL: w=0 or h=0 means "use thickness value" for that dimension
      const t = int(p[2], 3);
      const rawW = int(p[0], t);
      const rawH = int(p[1], t);
      const w = rawW === 0 ? t : rawW;
      const h = rawH === 0 ? t : rawH;
      const color = readColor(p[3]);
      const rounding = int(p[4], 0);
      const gbComment = takeComment();

      // Stash filled-black non-rounded GBs as reverse-bg candidates for flushField.
      const filled = t >= Math.min(w, h);
      const reverseFlag = getReverseFlag();
      if (filled && color === "B" && rounding === 0 && !reverseFlag) {
        commitPendingReverseBg();
        s.reverseBg = { x: s.field.x, y: s.field.y, w, h, t, color, rounding, reverseFlag, comment: gbComment };
        return;
      }
      commitPendingReverseBg();
      pushGBObject(s.field.x, s.field.y, w, h, t, color, rounding, reverseFlag, gbComment);
    },
    GD(p) {
      commitPendingReverseBg();
      // ^GD{w},{h},{t},{color},{orientation}
      // orientation: L = top-left→bottom-right, R = top-right→bottom-left
      const gdW = int(p[0], 1);
      const gdH = int(p[1], 1);
      const gdT = int(p[2], 3);
      const gdColor = readColor(p[3]);
      const gdOri = (p[4] ?? "L").toUpperCase();
      const gdLen = Math.round(Math.sqrt(gdW * gdW + gdH * gdH));
      // Recover start point and angle from bounding-box FO position
      // 'L': dx>0,dy>0 → obj.x=boxX, angle=atan2(h,w)
      // 'R': dx<0,dy>0 → obj.x=boxX+w, angle=atan2(h,-w)
      const gdObjX = gdOri === "R" ? s.field.x + gdW : s.field.x;
      const gdAngle = Math.round(
        gdOri === "R"
          ? (Math.atan2(gdH, -gdW) * 180) / Math.PI
          : (Math.atan2(gdH, gdW) * 180) / Math.PI,
      );
      s.result.objects.push(
        makeObj(
          "line",
          gdObjX,
          s.field.y,
          {
            angle: gdAngle,
            length: gdLen,
            thickness: gdT,
            color: gdColor,
            reverse: getReverseFlag(),
          } satisfies LineProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GF(_, rest) {
      commitPendingReverseBg();
      // ^GF{A|B|C},{totalBytes},{totalBytes},{bytesPerRow},{payload}
      // Payload: raw hex (fmt A, RLE-optional) or `:B64:` / `:Z64:` wrappers.
      const format = rest[0]?.toUpperCase();
      if (format !== "A" && format !== "B" && format !== "C") {
        pushBrowserLimit(s.result, `^GF${rest}`);
        return;
      }

      // Extract params: skip "A," then find 3rd delimiter to separate params from data.
      // Respects ^CD-mutated delimiter so ^CD;^GFA;total;total;bpr;data still parses.
      const delim = s.format.delimiterChar;
      const gfRest = rest.slice(2); // "total,total,bytesPerRow,data..."
      let commaPos = -1;
      for (let n = 0; n < 3; n++) {
        commaPos = gfRest.indexOf(delim, commaPos + 1);
        if (commaPos === -1) break;
      }
      if (commaPos === -1) {
        pushBrowserLimit(s.result, `^GF${rest}`);
        return;
      }

      const gfParams = gfRest.slice(0, commaPos).split(delim);
      const gfBytesPerRow = int(gfParams[2], 0);
      // Everything after the 3rd comma is the (possibly compressed) graphic data
      const gfRawData = gfRest.slice(commaPos + 1);

      if (gfBytesPerRow <= 0) {
        pushBrowserLimit(s.result, `^GF${rest}`);
        return;
      }

      const gfSummary = `^GF${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;
      // Pass bytes-headers verbatim so re-export keeps the firmware buffer hint.
      const gfImage = decodeGraphicToImage(
        gfRawData,
        format,
        gfBytesPerRow,
        gfParams[0] ?? "",
        gfParams[1] ?? "",
        `imported_${crypto.randomUUID().slice(0, 8)}.png`,
      );
      if (!gfImage) {
        pushBrowserLimit(s.result, gfSummary);
        return;
      }
      if (!gfImage.crcOk) s.result.partialCmds.add("^GF");
      const posType = getPosType(s.field);
      s.result.objects.push(
        makeObj(
          "image",
          s.field.x,
          s.field.y,
          {
            imageId: gfImage.imageId,
            widthDots: gfImage.widthDots,
            threshold: 128,
            _gfaCache: gfImage.gfaCache,
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },
    GE(p) {
      commitPendingReverseBg();
      // ^GE{w},{h},{t},{color}
      const w = int(p[0], 100);
      const h = int(p[1], 100);
      const t = int(p[2], 3);
      const color = readColor(p[3]);
      const filled = t >= Math.min(w, h);
      s.result.objects.push(
        makeObj(
          "ellipse",
          s.field.x,
          s.field.y,
          {
            width: w,
            height: h,
            thickness: t,
            filled,
            color,
            reverse: getReverseFlag(),
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },
    GC(p) {
      commitPendingReverseBg();
      // ^GC{diameter},{thickness},{color}  → circle = ellipse with equal w/h
      const d = int(p[0], 100);
      const t = int(p[1], 3);
      const color = readColor(p[2]);
      const filled = t >= d;
      s.result.objects.push(
        makeObj(
          "ellipse",
          s.field.x,
          s.field.y,
          {
            width: d,
            height: d,
            thickness: t,
            filled,
            color,
            lockAspect: true,
            reverse: getReverseFlag(),
          } satisfies EllipseProps,
          undefined,
          takeComment(),
        ),
      );
    },

    // ── Recall stored graphic ──────────────────────────────────────────────
    XG(_, rest) {
      commitPendingReverseBg();
      // ^XGd:f.x,mx,my — references a graphic uploaded earlier via ~DY.
      // Two valid imports:
      //  - With preceding ~DY in the stream: full image (bytes + storedAs
      //    with embedInZpl=true) so re-emit produces the same upload+recall.
      //  - Without ~DY: the printer is assumed to host the file out-of-band
      //    (admin pre-loaded). Object gets storedAs.embedInZpl=false and
      //    no cached bitmap; the canvas falls back to a placeholder, the
      //    emitter skips the ~DY preamble but keeps the ^XG reference.
      const firstComma = rest.indexOf(s.format.delimiterChar);
      const xgPath = firstComma === -1 ? rest : rest.slice(0, firstComma);
      const parsed = parseStoragePath(xgPath);
      if (!parsed) {
        pushBrowserLimit(s.result, `^XG${rest}`);
        return;
      }
      const uploaded = s.fonts.downloadedGraphics.get(formatStoragePath(parsed, true));
      const posType = getPosType(s.field);
      if (uploaded) {
        s.result.objects.push(
          makeObj(
            "image",
            s.field.x,
            s.field.y,
            {
              imageId: uploaded.imageId,
              widthDots: uploaded.widthDots,
              threshold: 128,
              _gfaCache: uploaded.gfaCache,
              storedAs: { ...parsed, embedInZpl: true },
            } satisfies ImageProps,
            posType,
            takeComment(),
          ),
        );
        return;
      }
      // Recall-only: no bytes available, but the ZPL is valid and the
      // printer side is assumed to resolve. Surface as partial so the
      // import report flags the degraded preview.
      s.result.partialCmds.add("^XG");
      s.result.objects.push(
        makeObj(
          "image",
          s.field.x,
          s.field.y,
          {
            imageId: "",
            widthDots: 200,
            threshold: 128,
            storedAs: { ...parsed, embedInZpl: false },
          } satisfies ImageProps,
          posType,
          takeComment(),
        ),
      );
    },

    // ^GS{rotation},{height},{width} — selects the internal-font
    // legal-symbol glyph (^FD picks which: A=®, B=©, C=™, D=UL, E=CSA).
    GS(p) {
      s.field.fieldType = "symbol";
      s.field.symRot = readRotation(p[0]);
      s.field.symH = int(p[1], 30);
      s.field.symW = int(p[2], s.field.symH);
    },

    // ── ~DY downloaded TrueType / graphic payload ──────────────────────────
    // ~DY{drive}:{name},{fmt},{ext},{size},{bpr},{data}
    // Decodes ASCII hex (format 'A') TTF/OTF bytes into the font cache
    // so the canvas can preview the embedded font without a separate
    // upload. The path reconstruction (stem + extension code) round-
    // trips the same form the generator emits. Non-TTF extensions and
    // non-hex formats are left untouched and fall through to the
    // browser-limit bucket so the user sees what was dropped.
    DY(_p, rest) {
      // Parse manually because the data segment can be hundreds of
      // KB of hex; we want to avoid splitting that into the rest of
      // the params array. Param layout up to and including bytes-per-
      // row is fixed-arity, so we walk commas until we've found 5.
      const delim = s.format.delimiterChar;
      const c: number[] = [];
      for (let i = 0; i < rest.length && c.length < 5; i++) {
        if (rest[i] === delim) c.push(i);
      }
      if (c.length < 5) {
        pushBrowserLimit(s.result, `~DY${rest}`);
        return;
      }
      const [c0, c1, c2, c3, c4] = c;
      if (
        c0 === undefined ||
        c1 === undefined ||
        c2 === undefined ||
        c3 === undefined ||
        c4 === undefined
      ) {
        pushBrowserLimit(s.result, `~DY${rest}`);
        return;
      }
      const path = rest.slice(0, c0);
      const fmt = rest.slice(c0 + 1, c1).toUpperCase();
      const extCode = rest.slice(c1 + 1, c2).toUpperCase();
      const size = parseInt(rest.slice(c2 + 1, c3), 10);
      const dyBytesPerRow = parseInt(rest.slice(c3 + 1, c4), 10);
      const data = rest.slice(c4 + 1);
      const dySummary = `~DY${rest.slice(0, IMPORT_FINDING_PAYLOAD_LIMIT)}…`;

      // Graphic uploads (~DY ...,A/B/C,G,...): decode via the same payload
      // pipeline as ^GF, register the resulting image under the full
      // device:stem.GRF path. A subsequent ^XG can then instantiate it.
      if (extCode === "G" && (fmt === "A" || fmt === "B" || fmt === "C")) {
        if (!path || isNaN(dyBytesPerRow) || dyBytesPerRow <= 0) {
          pushBrowserLimit(s.result, dySummary);
          return;
        }
        const sizeStr = size > 0 ? String(size) : "";
        const dyImage = decodeGraphicToImage(
          data,
          fmt,
          dyBytesPerRow,
          sizeStr,
          sizeStr,
          `uploaded_${path.replace(/[:.]/g, "_")}.png`,
        );
        if (!dyImage) {
          pushBrowserLimit(s.result, dySummary);
          return;
        }
        if (!dyImage.crcOk) s.result.partialCmds.add("~DY");
        // Path normalisation: ~DY uses `device:stem` without extension; the
        // ^XG side resolves `device:stem.GRF`. Store the `.GRF` form so the
        // XG lookup is direct.
        const parsedDyPath = parseStoragePath(path);
        if (!parsedDyPath) {
          pushBrowserLimit(s.result, dySummary);
          return;
        }
        s.fonts.downloadedGraphics.set(formatStoragePath(parsedDyPath, true), {
          imageId: dyImage.imageId,
          widthDots: dyImage.widthDots,
          heightDots: dyImage.heightDots,
          gfaCache: dyImage.gfaCache,
        });
        return;
      }

      // Only ASCII-hex TTF/OTF imports are supported. Z64 / compressed
      // payloads need a CRC-checked decoder and stay out of scope.
      if (fmt !== "A" || (extCode !== "T" && extCode !== "B")) {
        pushBrowserLimit(s.result, dySummary);
        return;
      }
      if (!path || isNaN(size) || size <= 0 || data.length < size * 2) {
        pushBrowserLimit(s.result, dySummary);
        return;
      }
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        const byteHex = data.slice(i * 2, i * 2 + 2);
        const b = parseInt(byteHex, 16);
        if (isNaN(b)) {
          pushBrowserLimit(s.result, dySummary);
          return;
        }
        bytes[i] = b;
      }
      // Reconstruct the full filename with extension so the registered
      // name matches what ^CW points at. Generator emits "{stem}" with
      // the extension stripped, so we re-attach based on the code.
      const ext = extCode === "T" ? ".TTF" : ".BIN";
      const filename = path.includes(".")
        ? path.slice(path.lastIndexOf(":") + 1)
        : `${path.slice(path.indexOf(":") + 1)}${ext}`;
      const fullPath = path.includes(".") ? path : `${path}${ext}`;
      try {
        loadFontBytesSync(bytes, filename);
        s.fonts.downloadedFontPaths.add(fullPath);
      } catch {
        // Oversized or otherwise unloadable — surface as browser-limit.
        pushBrowserLimit(s.result, `~DY${path}`);
      }
    },
  };

  return {
    handlers,
    helpers: { commitPendingReverseBg, pushGBObject, getReverseFlag },
  };
}
