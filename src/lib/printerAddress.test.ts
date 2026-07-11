import { describe, it, expect, beforeEach } from "vitest";
import {
  getPreviewTransport,
  getUsbPrinterId,
  setPreviewTransport,
  setUsbPrinterId,
} from "./printerAddress";

// Pins the localStorage contract shared by the print dialog, the preview
// settings, and the preview slice.
describe("preview transport binding", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to network when unset or unknown", () => {
    expect(getPreviewTransport()).toBe("network");
    localStorage.setItem("zebra_preview_transport", "carrier-pigeon");
    expect(getPreviewTransport()).toBe("network");
  });

  it("round-trips usb", () => {
    setPreviewTransport("usb");
    expect(getPreviewTransport()).toBe("usb");
  });
});

describe("usb printer binding", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to no device", () => {
    expect(getUsbPrinterId()).toBe("");
  });

  it("round-trips the device id", () => {
    setUsbPrinterId("0a5f:0166:D4J260700032");
    expect(getUsbPrinterId()).toBe("0a5f:0166:D4J260700032");
  });
});
