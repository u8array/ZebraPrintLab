import { describe, it, expect } from "vitest";
import { createFeedbackSlice, type FeedbackSlice } from "./feedbackSlice";
import type { LabelState } from "../labelStore";

// Drive the slice creator with a minimal set/get so the channel semantics are
// tested without standing up the whole store.
function makeSlice(): { get: () => FeedbackSlice } {
  let state = {} as FeedbackSlice;
  const set = (partial: Partial<FeedbackSlice>) => {
    state = { ...state, ...partial };
  };
  const get = () => state;
  state = createFeedbackSlice(
    set as unknown as Parameters<typeof createFeedbackSlice>[0],
    get as unknown as () => LabelState,
    {} as Parameters<typeof createFeedbackSlice>[2],
  );
  return { get };
}

describe("feedbackSlice", () => {
  it("starts empty", () => {
    expect(makeSlice().get().userError).toBeNull();
  });

  it("setUserError defaults retryExport to false", () => {
    const { get } = makeSlice();
    get().setUserError("boom");
    expect(get().userError).toEqual({ message: "boom", retryExport: false });
  });

  it("setUserError offers the export retry only when asked (the print path)", () => {
    const { get } = makeSlice();
    get().setUserError("print failed", { retryExport: true });
    expect(get().userError).toEqual({ message: "print failed", retryExport: true });
  });

  it("is most-recent-wins: a second error replaces the first", () => {
    const { get } = makeSlice();
    get().setUserError("first", { retryExport: true });
    get().setUserError("second");
    expect(get().userError).toEqual({ message: "second", retryExport: false });
  });

  it("clearUserError empties the channel", () => {
    const { get } = makeSlice();
    get().setUserError("boom");
    get().clearUserError();
    expect(get().userError).toBeNull();
  });
});
