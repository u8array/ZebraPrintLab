/**
 * Pure check-digit math for the EAN/UPC family. No Canvas/React/bwip
 * deps so registry leaves and tests can import from here without
 * dragging in the canvas renderer.
 */

/**
 * Mod-10 check digit with alternating weights. `w0` is applied to the
 * 0th, 2nd, … digit; `w1` to the 1st, 3rd, … digit. EAN-13 uses (1, 3)
 * scanning left-to-right; EAN-8 and UPC-A use (3, 1).
 */
export function eanCheckDigit(digits: string, w0: number, w1: number): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++)
    sum += parseInt(digits[i] ?? "0", 10) * (i % 2 === 0 ? w0 : w1);
  return String((10 - (sum % 10)) % 10);
}

/** Code 11 weighted mod-11 over `s` right-to-left; weights cycle 1..maxWeight.
 *  A result of 10 renders as the dash symbol, Code 11's value-10 character. */
function code11Weighted(s: string, maxWeight: number): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[s.length - 1 - i] ?? "0";
    const val = ch === "-" ? 10 : parseInt(ch, 10);
    if (Number.isNaN(val)) continue; // skip non Code 11 chars instead of NaN
    sum += val * ((i % maxWeight) + 1);
  }
  const r = sum % 11;
  return r === 10 ? "-" : String(r);
}

/** Code 11 check digit(s): the C digit, plus the K digit when `two` (the
 *  ^B1 e=N case). Verified: "12345" -> C=2, K=8. */
export function code11CheckDigits(data: string, two: boolean): string {
  const c = code11Weighted(data, 10);
  return two ? c + code11Weighted(data + c, 9) : c;
}

/** Compute the UPC-E check digit from the 6 compressed data digits. */
export function upceCheckDigit(digits6: string): string {
  const [vA, vB, vC, vD, vE, vF] = digits6.padEnd(6, "0").split("");
  const fi = parseInt(vF ?? "0", 10);
  let exp: string;
  if (fi <= 2) exp = `0${vA}${vB}${vF}0000${vC}${vD}${vE}`;
  else if (fi === 3) exp = `0${vA}${vB}${vC}00000${vD}${vE}`;
  else if (fi === 4) exp = `0${vA}${vB}${vC}${vD}00000${vE}`;
  else exp = `0${vA}${vB}${vC}${vD}${vE}${vF}0000`;
  return eanCheckDigit(exp, 3, 1);
}
