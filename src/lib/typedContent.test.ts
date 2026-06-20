import { describe, it, expect } from "vitest";
import { encodeContent, parseContent, recommendedEc, isContentComplete, type ContentType, type ContentFields } from "./typedContent";

function roundtrip(type: ContentType, fields: ContentFields) {
  const parsed = parseContent(encodeContent(type, fields));
  expect(parsed.type).toBe(type);
  return parsed.fields;
}

describe("encodeContent", () => {
  it("URL: keeps a scheme, adds https:// when missing", () => {
    expect(encodeContent("url", { url: "https://x.io/a" })).toBe("https://x.io/a");
    expect(encodeContent("url", { url: "example.com" })).toBe("https://example.com");
  });

  it("WiFi: ZXing format, omits P for nopass, H only when hidden", () => {
    expect(encodeContent("wifi", { ssid: "net", password: "pw", auth: "WPA" })).toBe("WIFI:T:WPA;S:net;P:pw;;");
    expect(encodeContent("wifi", { ssid: "net", auth: "nopass", password: "x" })).toBe("WIFI:T:nopass;S:net;;");
    expect(encodeContent("wifi", { ssid: "net", password: "pw", auth: "WPA", hidden: "true" })).toBe(
      "WIFI:T:WPA;S:net;P:pw;H:true;;",
    );
  });

  it("WiFi: escapes specials (backslash first) and quotes all-hex values", () => {
    expect(encodeContent("wifi", { ssid: 'a;b,c"d\\e', password: "p", auth: "WPA" })).toBe(
      'WIFI:T:WPA;S:a\\;b\\,c\\"d\\\\e;P:p;;',
    );
    expect(encodeContent("wifi", { ssid: "ABCD", auth: "nopass" })).toContain('S:"ABCD";');
  });

  it("email: percent-encodes subject/body with CRLF newlines", () => {
    expect(encodeContent("email", { to: "a@b.c", subject: "Hi there", body: "l1\nl2" })).toBe(
      "mailto:a@b.c?subject=Hi%20there&body=l1%0D%0Al2",
    );
    expect(encodeContent("email", { to: "a@b.c" })).toBe("mailto:a@b.c");
  });

  it("tel/sms: normalize the number (keep +, strip separators)", () => {
    expect(encodeContent("tel", { number: "+1 (212) 555-0123" })).toBe("tel:+12125550123");
    expect(encodeContent("sms", { number: "0151 234", message: "hi" })).toBe("SMSTO:0151234:hi");
  });

  it("geo/vcard basics", () => {
    expect(encodeContent("geo", { lat: "48.20", lng: "16.37" })).toBe("geo:48.20,16.37");
    expect(encodeContent("vcard", { firstName: "Sean", lastName: "Owen", email: "s@x.io" })).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nN:Owen;Sean;;;\nFN:Sean Owen\nEMAIL:s@x.io\nEND:VCARD",
    );
  });
});

describe("parseContent round-trips", () => {
  it("url / text", () => {
    expect(roundtrip("url", { url: "https://x.io/a" })).toEqual({ url: "https://x.io/a" });
    expect(roundtrip("text", { text: "hello world" })).toEqual({ text: "hello world" });
  });
  it("wifi incl. escaped specials and all-hex", () => {
    expect(roundtrip("wifi", { ssid: 'a;b,c"d\\e', password: "p:w", auth: "WPA" })).toMatchObject({
      ssid: 'a;b,c"d\\e',
      password: "p:w",
      auth: "WPA",
    });
    expect(roundtrip("wifi", { ssid: "ABCD", auth: "nopass" }).ssid).toBe("ABCD");
  });
  it("vcard / email / tel / sms / geo", () => {
    expect(roundtrip("vcard", { firstName: "Sean", lastName: "Owen", org: "ACME", email: "s@x.io" })).toMatchObject({
      firstName: "Sean", lastName: "Owen", org: "ACME", email: "s@x.io",
    });
    expect(roundtrip("email", { to: "a@b.c", subject: "Hi", body: "l1\nl2" })).toEqual({
      to: "a@b.c", subject: "Hi", body: "l1\nl2",
    });
    expect(roundtrip("sms", { number: "12125550123", message: "hi" })).toEqual({
      number: "12125550123", message: "hi",
    });
    expect(roundtrip("geo", { lat: "48.2", lng: "16.37" })).toEqual({ lat: "48.2", lng: "16.37" });
  });
});

describe("parseContent never throws on malformed input", () => {
  it("keeps a raw value when percent-decoding fails", () => {
    expect(() => parseContent("mailto:a@b.c?subject=%")).not.toThrow();
    expect(parseContent("mailto:%E0%A4%A").type).toBe("email"); // truncated escape
    expect(parseContent("mailto:a@b.c?subject=%").fields.subject).toBe("%");
  });
  it("keeps '=' inside a mailto body (splits on the first = only)", () => {
    expect(parseContent("mailto:a@b.c?body=a=b").fields.body).toBe("a=b");
  });
  it("skips a malformed WiFi field without a colon and parses the rest", () => {
    const r = parseContent("WIFI:T:WPA;S:net;BADFIELD;P:pw;;");
    expect(r.type).toBe("wifi");
    expect(r.fields).toMatchObject({ auth: "WPA", ssid: "net", password: "pw" });
  });
});

describe("parseContent classification", () => {
  it("matches URI schemes case-insensitively and falls back to text", () => {
    expect(parseContent("MAILTO:a@b.c").type).toBe("email");
    expect(parseContent("Wifi:T:WPA;S:x;;").type).toBe("wifi");
    expect(parseContent("just some text").type).toBe("text");
    expect(parseContent("geo:1,2").type).toBe("geo");
  });
});

describe("isContentComplete", () => {
  it("requires a digit for tel/sms", () => {
    expect(isContentComplete("tel", { number: "abc" })).toBe(false);
    expect(isContentComplete("tel", { number: "+49 30 1" })).toBe(true);
    expect(isContentComplete("sms", { number: "" })).toBe(false);
  });
  it("requires in-range numeric coordinates for geo", () => {
    expect(isContentComplete("geo", { lat: "abc", lng: "1" })).toBe(false);
    expect(isContentComplete("geo", { lat: "91", lng: "0" })).toBe(false); // lat out of range
    expect(isContentComplete("geo", { lat: "48.2", lng: "16.37" })).toBe(true);
  });
  it("requires the key field for the simple types", () => {
    expect(isContentComplete("url", { url: "" })).toBe(false);
    expect(isContentComplete("wifi", { ssid: "net" })).toBe(true);
    expect(isContentComplete("vcard", { firstName: "A" })).toBe(true);
  });
});

describe("recommendedEc", () => {
  it("suggests by length", () => {
    expect(recommendedEc("x")).toBe("Q");
    expect(recommendedEc("x".repeat(200))).toBe("M");
    expect(recommendedEc("x".repeat(400))).toBe("L");
  });
});
