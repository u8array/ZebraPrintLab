import { describe, it, expect } from "vitest";
import { isLikelyZebra, type UsbPrinter } from "./usbPrint";

const p = (over: Partial<UsbPrinter>): UsbPrinter => ({ id: "x", name: "n", vendor_id: "0000", ...over });

describe("isLikelyZebra", () => {
  it("flags the Zebra vendor id", () => {
    expect(isLikelyZebra(p({ vendor_id: "0a5f" }))).toBe(true);
  });
  it("does not flag other vendors", () => {
    expect(isLikelyZebra(p({ vendor_id: "03f0" }))).toBe(false);
  });
});
