/**
 * Typed barcode content: encode a chosen data type (URL, WiFi, vCard, …) to the
 * canonical string, and parse an existing string back to {type, fields} for
 * round-trip editing. Symbology-agnostic (QR, DataMatrix, …). Pure, no UI.
 *
 * Encodings follow the de-facto ZXing "Barcode Contents" conventions and the
 * relevant RFCs (mailto 6068, tel 3966, geo 5870), verified against a barcode
 * decoder. Parsing never throws and falls back to plain text, so it can't
 * corrupt unrecognized content.
 */

export type ContentType = "url" | "text" | "wifi" | "vcard" | "email" | "tel" | "sms" | "geo";

export const CONTENT_TYPES: readonly ContentType[] = [
  "url", "text", "wifi", "vcard", "email", "tel", "sms", "geo",
];

export type ContentFields = Record<string, string>;

/** WiFi/MECARD value escaping: backslash FIRST, then ; , " : . An all-hex value
 *  is wrapped in quotes so a scanner doesn't read it as hex. */
function escWifi(s: string): string {
  const e = s.replace(/\\/g, "\\\\").replace(/([;,":])/g, "\\$1");
  return s.length > 0 && /^[0-9A-Fa-f]+$/.test(s) ? `"${e}"` : e;
}

/** vCard 3.0 text-value escaping: backslash, then comma, semicolon, newline. */
function escVcard(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Phone normalization for tel:/SMSTO: keep a single leading +, digits only. */
function normalizeTel(s: string): string {
  const plus = s.trim().startsWith("+") ? "+" : "";
  return plus + s.replace(/\D/g, "");
}

/** Whether `f` has enough valid input for `type` to produce a sound payload.
 *  Gates the modal's Apply: tel/sms need a digit, geo needs in-range numbers. */
export function isContentComplete(type: ContentType, f: ContentFields): boolean {
  switch (type) {
    case "url": return !!f.url?.trim();
    case "text": return !!f.text;
    case "wifi": return !!f.ssid?.trim();
    case "vcard": return !!(f.firstName?.trim() || f.lastName?.trim());
    case "email": return !!f.to?.trim();
    case "tel":
    case "sms": return /\d/.test(f.number ?? "");
    case "geo": return inRange(f.lat, -90, 90) && inRange(f.lng, -180, 180);
  }
}

function inRange(s: string | undefined, min: number, max: number): boolean {
  if (!s || s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max;
}

export function encodeContent(type: ContentType, f: ContentFields): string {
  switch (type) {
    case "url": {
      const url = (f.url ?? "").trim();
      if (!url) return "";
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    }
    case "text":
      return f.text ?? "";
    case "wifi": {
      const auth = f.auth === "WEP" || f.auth === "nopass" ? f.auth : "WPA";
      let out = `WIFI:T:${auth};S:${escWifi(f.ssid ?? "")};`;
      if (auth !== "nopass" && f.password) out += `P:${escWifi(f.password)};`;
      if (f.hidden === "true") out += "H:true;";
      return out + ";";
    }
    case "vcard": {
      const last = f.lastName ?? "";
      const first = f.firstName ?? "";
      const fn = `${first} ${last}`.trim() || last || first;
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escVcard(last)};${escVcard(first)};;;`, `FN:${escVcard(fn)}`];
      if (f.org) lines.push(`ORG:${escVcard(f.org)}`);
      if (f.title) lines.push(`TITLE:${escVcard(f.title)}`);
      if (f.tel) lines.push(`TEL:${escVcard(normalizeTel(f.tel))}`);
      if (f.email) lines.push(`EMAIL:${escVcard(f.email)}`);
      if (f.url) lines.push(`URL:${escVcard(f.url)}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "email": {
      const to = (f.to ?? "").trim();
      const params: string[] = [];
      if (f.subject) params.push(`subject=${encodeURIComponent(f.subject)}`);
      if (f.body) params.push(`body=${encodeURIComponent(f.body.replace(/\r?\n/g, "\r\n"))}`);
      return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
    }
    case "tel":
      return `tel:${normalizeTel(f.number ?? "")}`;
    case "sms":
      return `SMSTO:${normalizeTel(f.number ?? "")}:${f.message ?? ""}`;
    case "geo":
      return `geo:${(f.lat ?? "").trim()},${(f.lng ?? "").trim()}`;
  }
}

/** Split on `delim` not preceded by an escaping backslash. */
function splitUnescaped(s: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === "\\" && i + 1 < s.length) {
      cur += c + s.charAt(i + 1);
      i++;
      continue;
    }
    if (c === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Collapse `\x` escapes to `x` (and `\n` to newline). */
function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c));
}

/** decodeURIComponent that returns the raw value on malformed input, so parsing
 *  never throws (e.g. a stray `%` in a pasted mailto:). */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseWifi(content: string): ContentFields {
  const body = content.slice(content.indexOf(":") + 1); // after "WIFI:"
  const f: ContentFields = {};
  for (const field of splitUnescaped(body, ";")) {
    if (!field) continue;
    const c = field.indexOf(":");
    if (c < 0) continue;
    const k = field.slice(0, c);
    let v = field.slice(c + 1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    v = unescape(v);
    if (k === "S") f.ssid = v;
    else if (k === "P") f.password = v;
    else if (k === "T") f.auth = v;
    else if (k === "H" && v.toLowerCase() === "true") f.hidden = "true";
  }
  return f;
}

function parseVcard(content: string): ContentFields {
  const f: ContentFields = {};
  for (const line of content.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const tag = (line.slice(0, idx).split(";")[0] ?? "").toUpperCase();
    const val = line.slice(idx + 1);
    if (tag === "N") {
      const parts = splitUnescaped(val, ";").map(unescape);
      f.lastName = parts[0] ?? "";
      f.firstName = parts[1] ?? "";
    } else if (tag === "ORG") f.org = unescape(val);
    else if (tag === "TITLE") f.title = unescape(val);
    else if (tag === "TEL") f.tel = unescape(val);
    else if (tag === "EMAIL") f.email = unescape(val);
    else if (tag === "URL") f.url = unescape(val);
  }
  return f;
}

function parseEmail(content: string): ContentFields {
  const rest = content.slice("mailto:".length);
  const q = rest.indexOf("?");
  const to = q < 0 ? rest : rest.slice(0, q);
  const f: ContentFields = { to: safeDecode(to) };
  if (q >= 0) {
    for (const pair of rest.slice(q + 1).split("&")) {
      const eq = pair.indexOf("=");
      const k = eq < 0 ? pair : pair.slice(0, eq);
      const v = eq < 0 ? "" : pair.slice(eq + 1);
      const dv = safeDecode(v.replace(/\+/g, "%20"));
      if (k === "subject") f.subject = dv;
      else if (k === "body") f.body = dv.replace(/\r\n/g, "\n");
    }
  }
  return f;
}

/** Classify and parse existing QR content. Specific prefixes first; URI schemes
 *  matched case-insensitively. Unknown content becomes plain text. */
export function parseContent(content: string): { type: ContentType; fields: ContentFields } {
  const t = content.trimStart();
  if (/^wifi:/i.test(t)) return { type: "wifi", fields: parseWifi(t) };
  if (/^begin:vcard/i.test(t)) return { type: "vcard", fields: parseVcard(t) };
  if (/^mailto:/i.test(t)) return { type: "email", fields: parseEmail(t) };
  if (/^tel:/i.test(t)) return { type: "tel", fields: { number: t.slice(4) } };
  if (/^smsto:/i.test(t)) {
    const rest = t.slice(6);
    const sep = rest.indexOf(":");
    return {
      type: "sms",
      fields: sep < 0 ? { number: rest } : { number: rest.slice(0, sep), message: rest.slice(sep + 1) },
    };
  }
  if (/^geo:/i.test(t)) {
    const [lat = "", lng = ""] = t.slice(4).split(",");
    return { type: "geo", fields: { lat, lng } };
  }
  if (/^https?:\/\//i.test(t)) return { type: "url", fields: { url: content } };
  return { type: "text", fields: { text: content } };
}

/** Suggested QR error-correction level by content length (a hint, not a rule):
 *  shorter content can afford more recovery. */
export function recommendedEc(content: string): "L" | "M" | "Q" {
  if (content.length > 300) return "L";
  if (content.length > 120) return "M";
  return "Q";
}
