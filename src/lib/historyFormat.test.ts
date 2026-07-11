import { describe, it, expect } from "vitest";
import { buildHistorySubmenu } from "./historyFormat";
import { fallbackTranslations as en } from "../locales";
import type { HistoryStepDescriptor } from "./historyStep";

const entry = (isCurrent: boolean): { descriptor: HistoryStepDescriptor; isCurrent: boolean } => ({
  descriptor: { kind: "edit", count: 1 },
  isCurrent,
});

// entries with `current` at index `cur`, length `n`.
const timeline = (n: number, cur: number) =>
  Array.from({ length: n }, (_, i) => entry(i === cur));

describe("buildHistorySubmenu", () => {
  it("renders an empty (disabled) submenu at 0-1 entries", () => {
    expect(buildHistorySubmenu(en, [], 0, false, false).items).toEqual([]);
    expect(buildHistorySubmenu(en, timeline(1, 0), 0, false, false).items).toEqual([]);
  });

  it("windows around the current step and maps absolute indices", () => {
    const m = buildHistorySubmenu(en, timeline(30, 20), 20, false, true);
    // start = max(0, 20 - 12) = 8; slice(8, 33) over 30 entries -> 22 items.
    expect(m.items).toHaveLength(22);
    expect(m.items[0]?.index).toBe(8);
    expect(m.items.at(-1)?.index).toBe(29);
    // current sits at absolute 20 -> window position 12.
    expect(m.items[12]?.current).toBe(true);
    expect(m.items[12]?.index).toBe(20);
  });

  it("clamps the window start at 0 near the beginning", () => {
    const m = buildHistorySubmenu(en, timeline(5, 2), 2, false, true);
    expect(m.items[0]?.index).toBe(0);
    expect(m.items).toHaveLength(5);
  });

  it("disables the current step but leaves the others enabled", () => {
    const m = buildHistorySubmenu(en, timeline(4, 1), 1, false, true);
    expect(m.items.map((i) => i.enabled)).toEqual([true, false, true, true]);
  });

  it("makes every step and clear inert under a preview lock", () => {
    const m = buildHistorySubmenu(en, timeline(4, 1), 1, true, true);
    expect(m.items.every((i) => !i.enabled)).toBe(true);
    expect(m.canClear).toBe(false);
  });

  it("passes canClear through only when unlocked", () => {
    expect(buildHistorySubmenu(en, timeline(4, 1), 1, false, true).canClear).toBe(true);
    expect(buildHistorySubmenu(en, timeline(4, 1), 1, false, false).canClear).toBe(false);
  });
});
