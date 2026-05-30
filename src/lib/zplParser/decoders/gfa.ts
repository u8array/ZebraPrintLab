import { unzlibSync } from "fflate";
import { parseGfWrapper } from "./crc";

/** Inflate `:Z64:` zlib payload; null on malformed deflate stream. */
function tryInflateZlib(input: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(input);
  } catch {
    return null;
  }
}

/** Decode the ASCII-hex output of `decompressGFA` into a packed byte array
 *  so all three GF code paths converge on the same `Uint8Array` shape.
 *  Indexed access + nibble shift instead of `parseInt(slice)` because the
 *  per-byte slice/parseInt pair is the dominant cost on multi-KB bitmaps. */
function gfaHexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const hi = parseInt(hex[i * 2] ?? "0", 16);
    const lo = parseInt(hex[i * 2 + 1] ?? "0", 16);
    out[i] = (hi << 4) | lo;
  }
  return out;
}

interface GfPayloadDecoded {
  data: Uint8Array;
  crcOk: boolean;
}

/**
 * Normalise a `^GF{A|B|C}` payload to packed bitmap bytes. Hides the
 * format / wrapper / compression dispatch from the command handler so
 * the latter can stay focused on positioning and pixel painting.
 *
 *  - `:B64:`/`:Z64:` wrapper → base64-decode (then zlib-inflate for Z64)
 *  - `format=A` without wrapper → existing RLE-hex path → bytes
 *  - `format=B`/`C` without wrapper → null (raw binary can't survive the
 *    text-based ZPL channel and the parser never sees intact bytes anyway)
 */
export function gfPayloadToBytes(
  rawData: string,
  format: "A" | "B" | "C",
  bytesPerRow: number,
): GfPayloadDecoded | null {
  const wrapper = parseGfWrapper(rawData);
  if (wrapper) {
    const bytes =
      wrapper.kind === "z64" ? tryInflateZlib(wrapper.bytes) : wrapper.bytes;
    if (!bytes) return null;
    return { data: bytes, crcOk: wrapper.crcOk };
  }
  if (format === "A") {
    return { data: gfaHexToBytes(decompressGFA(rawData, bytesPerRow)), crcOk: true };
  }
  return null;
}

const HEX_RE = /[0-9A-Fa-f]/;
const isHex = (ch: string) => HEX_RE.test(ch);
const isCompressChar = (ch: string) =>
  (ch >= "G" && ch <= "Y") || (ch >= "g" && ch <= "z");
const repeatCount = (ch: string): number => {
  if (ch >= "G" && ch <= "Y") return ch.charCodeAt(0) - 70; // G=1 .. Y=19
  if (ch >= "g" && ch <= "z") return (ch.charCodeAt(0) - 102) * 20; // g=20 .. z=400
  return 0;
};

/**
 * Decompress ZPL Alternative Data Compression used in ^GFA fields.
 *
 * Compression characters:
 *   G–Y (uppercase) → repeat next hex digit 1–19 times
 *   g–z (lowercase) → repeat next hex digit 20–400 times (multiples of 20)
 *   Combinable: e.g. hI0 = (40+3) × '0' = 43 zeros
 *   ,  → fill remainder of current row with '0'
 *   !  → fill remainder of current row with 'F'
 *   :  → repeat previous row
 */
function decompressGFA(data: string, bytesPerRow: number): string {
  const nibblesPerRow = bytesPerRow * 2;
  const rows: string[] = [];
  let currentRow = "";
  let i = 0;

  const pushRow = () => {
    rows.push(currentRow.slice(0, nibblesPerRow).padEnd(nibblesPerRow, "0"));
    currentRow = "";
  };

  while (i < data.length) {
    const ch = data[i] ?? "";

    if (ch === ",") {
      pushRow();
      i++;
    } else if (ch === "!") {
      currentRow = currentRow.padEnd(nibblesPerRow, "F");
      rows.push(currentRow.slice(0, nibblesPerRow));
      currentRow = "";
      i++;
    } else if (ch === ":") {
      rows.push(
        rows.length > 0
          ? (rows[rows.length - 1] ?? "0".repeat(nibblesPerRow))
          : "0".repeat(nibblesPerRow),
      );
      i++;
    } else if (isCompressChar(ch)) {
      let count = repeatCount(ch);
      i++;
      while (i < data.length && isCompressChar(data[i] ?? "")) {
        count += repeatCount(data[i] ?? "");
        i++;
      }
      const nextCh = data[i] ?? "";
      if (i < data.length && isHex(nextCh)) {
        currentRow += nextCh.repeat(count);
        i++;
      }
    } else if (isHex(ch)) {
      currentRow += ch;
      i++;
    } else {
      i++;
    }

    if (currentRow.length >= nibblesPerRow) {
      rows.push(currentRow.slice(0, nibblesPerRow));
      currentRow = currentRow.slice(nibblesPerRow);
    }
  }

  if (currentRow.length > 0) {
    pushRow();
  }

  return rows.join("");
}
