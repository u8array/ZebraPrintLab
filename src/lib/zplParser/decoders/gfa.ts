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

/** Nibble shift over slice/parseInt; the per-byte pair dominates on multi-KB bitmaps. */
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

/** :B64:/:Z64: -> base64 (+inflate); format=A -> RLE-hex; B/C w/o wrapper -> null. */
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

// ^GFA ZPL Alt Data Compression: G-Y x1-19, g-z x20-400 (mult 20), combinable.
// , = pad row with 0; ! = pad with F; : = repeat previous row.
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
