import { isMuDpi } from "../../../types/LabelConfig";
import type { ParserState } from "../context";
import type { Handler } from "../types";

/** ^MU units-of-measure handler. Owns one format-state slice
 *  (`unitScale`) and one labelConfig slice (`muResampling`); kept
 *  together because both express the same command's intent. */
export function createUnitsHandler(s: ParserState, dpmm: number): Record<string, Handler> {
  const labelConfig = s.result.labelConfig;
  const markPartial = () => s.result.partialCmds.add("^MU");

  return {
    // a-slot scales dot-quantities on read so the model stays
    // dots-canonical. b,c are a paired resampling directive persisted
    // for re-emit; printer does the actual scaling at print time.
    MU(p) {
      const a = (p[0] ?? "").trim().toUpperCase();
      if (a === "I") s.format.unitScale = dpmm * 25.4;
      else if (a === "M") s.format.unitScale = dpmm;
      else if (a === "" || a === "D") s.format.unitScale = 1;
      else markPartial(); // unknown a-slot: preserve prior unitScale

      const rawB = (p[1] ?? "").trim();
      const rawC = (p[2] ?? "").trim();
      // Both-or-neither: a half-set pair has no usable ratio, so a
      // lone b or c is a partial import.
      if (!rawB && !rawC) return;
      const b = Number.parseInt(rawB, 10);
      const c = Number.parseInt(rawC, 10);
      if (isMuDpi(b) && isMuDpi(c)) {
        labelConfig.muResampling = { formatDpi: b, outputDpi: c };
      } else {
        markPartial();
      }
    },
  };
}
