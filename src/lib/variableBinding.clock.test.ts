import { describe, it, expect } from "vitest";
import { applyBindingToObject } from "./variableBinding";
import type { LabelObject } from "../types/Group";

const newTextObj = (content: string): LabelObject =>
  ({
    id: "t",
    type: "text",
    x: 0,
    y: 0,
    rotation: 0,
    props: { content, fontHeight: 20, fontWidth: 0, rotation: "N" },
  }) as unknown as LabelObject;

// Fixed `now` so the assertions don't drift with wall-clock.
const NOW = new Date(2026, 4, 24, 9, 7, 3); // 24 May 2026 09:07:03

describe("applyBindingToObject — clock markers", () => {
  it("substitutes clock markers using the supplied `now`", () => {
    const obj = newTextObj("Printed «clock:d»/«clock:m»/«clock:Y» «clock:H»:«clock:M»");
    const out = applyBindingToObject(obj, [], null, "preview", { now: NOW });
    expect((out as { props: { content: string } }).props.content)
      .toBe("Printed 24/05/2026 09:07");
  });

  it("leaves clock markers literal in schema mode", () => {
    const obj = newTextObj("Date «clock:d»");
    const out = applyBindingToObject(obj, [], null, "schema", { now: NOW });
    expect((out as { props: { content: string } }).props.content)
      .toBe("Date «clock:d»");
  });

  it("composes with variable markers (variable resolves first, then clock)", () => {
    const obj = newTextObj("SKU «sku» on «clock:Y»-«clock:m»-«clock:d»");
    const out = applyBindingToObject(
      obj,
      [{ id: "v", name: "sku", fnNumber: 1, defaultValue: "ABC-1" }],
      null,
      "preview",
      { now: NOW },
    );
    expect((out as { props: { content: string } }).props.content)
      .toBe("SKU ABC-1 on 2026-05-24");
  });

  it("returns the same object reference when no markers are present", () => {
    const obj = newTextObj("plain literal");
    const out = applyBindingToObject(obj, [], null, "preview", { now: NOW });
    expect(out).toBe(obj);
  });
});
