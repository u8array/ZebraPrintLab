import { describe, it, expect, beforeEach } from "vitest";
import { useLabelStore } from "../store/labelStore";
import { importZplText } from "./zplImportService";
import { generateMultiPageZPL } from "./zplGenerator";

// Integration: drive the REAL user paths (importZplText -> loadDesign -> store ->
// generateMultiPageZPL), not parseZPL/generate in isolation. Asserts the actual
// overlay contract: an untouched block re-exports byte-identically (config,
// comments, and fields that depend on running ^CF all ride along in the
// overlay), an edited field regenerates self-contained in place, and the cycle
// is a fixpoint. Per-gate rules are unit-tested in zplRoundtrip.test.ts.

const store = () => useLabelStore.getState();

// Reset the shared store so config/variable edits in one test can't bleed into
// the next (importInto reads store().label as its base).
beforeEach(() => {
  useLabelStore.setState({
    label: { widthMm: 100, heightMm: 60, dpmm: 8 },
    pages: [{ objects: [] }],
    currentPageIndex: 0,
    selectedIds: [],
    variables: [],
    csvMapping: null,
    csvDataset: null,
  });
});

function importInto(zpl: string): void {
  const label = store().label;
  const r = importZplText(zpl, label.dpmm);
  store().loadDesign({ ...label, ...r.labelConfig }, r.pages, r.variables);
}
const exportZpl = (): string => {
  const s = store();
  return generateMultiPageZPL(s.label, s.pages, s.variables);
};

// Representative document: a verbatim-eligible text (inline ^A), a shape, a
// barcode with inline ^BY, a comment, and config that always regenerates.
const TEXT = "^FO50,50^A0N,30,30^FDHello^FS";
const BOX = "^FO50,120^GB200,80,3^FS";
const BARCODE = "^FO50,220^BY3^BCN,100,Y,N,N^FD12345^FS";
const DOC = `^XA\n^PW800\n^LL400\n^FXheader note\n${TEXT}\n${BOX}\n${BARCODE}\n^XZ`;

// A realistic foreign shipping label: encoding, comments, mixed fonts, a
// barcode with inline ^BY, a rule, and a print quantity. No geometry sidecar
// (foreign ZPL never has one), so it exercises the real import path.
const REAL_LABEL = [
  "^XA",
  "^CI28",
  "^FO40,40^A0N,40,40^FDACME Logistics^FS",
  "^FXship-to block",
  "^FO40,110^A0N,28,28^FDJohn Doe^FS",
  "^FO40,150^A0N,28,28^FD123 Main Street^FS",
  "^FO40,260^BY3^BCN,120,Y,N,N^FD1Z9999W99^FS",
  "^FO40,420^GB720,3,3^FS",
  "^PQ2",
  "^XZ",
].join("\n");

describe("round-trip integration (real import -> store -> export)", () => {
  it("a realistic foreign label re-exports byte-identically with zero edits", () => {
    importInto(REAL_LABEL);
    expect(exportZpl()).toBe(REAL_LABEL);
  });

  it("a realistic foreign label: edit one field, the rest stays byte-identical", () => {
    importInto(REAL_LABEL);
    const addr = store().pages[0]!.objects.find(
      (o) => "props" in o && (o.props as { content?: string }).content === "123 Main Street",
    )!;
    store().updateObject(addr.id, { x: 60 });
    const out = exportZpl();
    expect(out).toContain("^FO40,40^A0N,40,40^FDACME Logistics^FS"); // untouched verbatim
    expect(out).toContain("^FO40,260^BY3^BCN,120,Y,N,N^FD1Z9999W99^FS");
    expect(out).toContain("^FO40,420^GB720,3,3^FS");
    expect(out).toContain("^FXship-to block"); // comment once, not duplicated
    expect(out.split("ship-to block").length - 1).toBe(1);
    expect(out).not.toContain("^FO40,150^A0N,28,28^FD123 Main Street^FS"); // moved -> regenerated
    expect(out).toContain("^FO60,"); // new x
  });


  it("re-exports every untouched field byte-verbatim, with its comment", () => {
    importInto(DOC);
    const out = exportZpl();
    expect(out).toContain(TEXT);
    expect(out).toContain(BOX);
    expect(out).toContain(BARCODE);
    expect(out).toContain("^FXheader note");
  });

  it("edits one field: it regenerates, the rest stay verbatim", () => {
    importInto(DOC);
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    store().updateObject(text.id, { x: 99 });
    const out = exportZpl();
    expect(out).not.toContain(TEXT); // edited -> regenerated
    expect(out).toContain("^FO99,"); // proves the new coordinate
    expect(out).toContain(BOX); // untouched -> still verbatim
    expect(out).toContain(BARCODE);
  });

  it("a two-page label round-trips byte-identically and is a fixpoint", () => {
    const two =
      "^XA\n^FO10,10^A0N,30,30^FDa^FS\n^XZ\n^XA\n^FO10,10^A0N,30,30^FDb^FS\n^XZ";
    importInto(two);
    const out1 = exportZpl();
    expect(out1).toBe(two); // no inter-block separator doubling
    importInto(out1);
    expect(exportZpl()).toBe(out1); // fixpoint
  });

  it("editing a commented object does not duplicate its ^FX comment", () => {
    importInto(DOC);
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    expect(text.comment).toBe("header note"); // ^FX attached to the text field
    store().updateObject(text.id, { x: 77 });
    const out = exportZpl();
    const count = out.split("header note").length - 1;
    expect(count).toBe(1); // exactly one ^FX, not the raw + regenerated pair
  });

  it("editing an object's comment is reflected on export (not stale)", () => {
    importInto(DOC);
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    store().updateObject(text.id, { comment: "revised note" });
    const out = exportZpl();
    expect(out).toContain("^FXrevised note");
    expect(out).not.toContain("header note"); // old comment gone, not duplicated
  });

  it("adding a comment to an imported object emits one ^FX", () => {
    importInto(DOC);
    const box = store().pages[0]!.objects.find((o) => o.type === "box")!;
    expect(box.comment).toBeUndefined();
    store().updateObject(box.id, { comment: "the box" });
    const out = exportZpl();
    expect(out.split("the box").length - 1).toBe(1);
    expect(out).toContain("^FXthe box");
  });

  it("undo of an edit clears dirty so the block replays verbatim again", () => {
    const src = "^XA^FO10,10^A0N,30,30^FDHi^FS^XZ";
    importInto(src);
    expect(exportZpl()).toBe(src);
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    store().updateObject(text.id, { x: 99 });
    expect(exportZpl()).not.toBe(src); // edited -> regenerated
    useLabelStore.temporal.getState().undo();
    // The dirty-tracking middleware must NOT re-stamp on a temporal restore.
    expect(store().pages[0]!.objects.find((o) => o.type === "text")!.dirty).toBeFalsy();
    expect(exportZpl()).toBe(src); // back to verbatim
  });

  it("import -> export -> reimport -> export is a fixpoint (no drift)", () => {
    importInto(DOC);
    const out1 = exportZpl();
    importInto(out1);
    const out2 = exportZpl();
    expect(out2).toBe(out1);
  });

  it("duplicating a page does not carry the overlay (clone regenerates)", () => {
    importInto("^XA^FO10,10^A0N,30,30^FDx^FS^XZ");
    expect(store().pages[0]!.overlay).toBeDefined();
    store().duplicatePage(0);
    expect(store().pages).toHaveLength(2);
    expect(store().pages[1]!.overlay).toBeUndefined(); // clone is net-new
  });

  it("reordering objects falls back to full regeneration (model order)", () => {
    importInto(DOC);
    expect(exportZpl()).not.toContain("^CI28"); // overlay replay: no synthesized header
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    store().reorderObject(text.id, 2); // move text to the top of the z-order
    const out = exportZpl();
    expect(out).toContain("^CI28"); // fell back to generateZPL (full header)
  });

  it("a shared ^FN slot across pages round-trips byte-identically (no merge-dirty)", () => {
    const src =
      "^XA^FO10,10^A0N,30,30^FN1^FDpageA^FS^XZ\n^XA^FO10,10^A0N,30,30^FN1^FDpageB^FS^XZ";
    importInto(src);
    // The cross-block merge must not dirty page 2; its original ^FD default
    // replays verbatim instead of regenerating with the merged variable's value.
    expect(exportZpl()).toBe(src);
  });

  it("setBoundDefault drops page overlays so the new default exports", () => {
    importInto("^XA^FO10,10^A0N,30,30^FN1^FDold^FS^XZ");
    expect(store().pages[0]!.overlay).toBeDefined();
    const v = store().variables[0]!;
    const obj = store().pages[0]!.objects[0]!;
    const props = (obj as unknown as { props: object }).props;
    store().setBoundDefault(v.id, "new", obj.id, { props: { ...props, content: "new" } });
    expect(store().pages[0]!.overlay).toBeUndefined();
  });

  it("changing a variable default drops page overlays (stale ^FN header)", () => {
    importInto("^XA^FO10,10^A0N,30,30^FN1^FDold^FS^XZ");
    expect(store().pages[0]!.overlay).toBeDefined();
    store().updateVariable(store().variables[0]!.id, { defaultValue: "new" });
    expect(store().pages[0]!.overlay).toBeUndefined();
  });

  it("removing a variable drops page overlays (orphan ^FN declaration)", () => {
    importInto("^XA^FO10,10^A0N,30,30^FN1^FDold^FS^XZ");
    expect(store().pages[0]!.overlay).toBeDefined();
    store().removeVariable(store().variables[0]!.id);
    expect(store().pages[0]!.overlay).toBeUndefined();
  });

  it("append-mode strips overlays from appended pages (current config wins)", () => {
    importInto("^XA^FO10,10^A0N,30,30^FDbase^FS^XZ");
    const r = importZplText("^XA^PW999^FO20,20^A0N,30,30^FDapp^FS^XZ", store().label.dpmm);
    expect(r.pages[0]!.overlay).toBeDefined();
    store().appendPages(r.pages);
    const appended = store().pages[store().pages.length - 1]!;
    expect(appended.overlay).toBeUndefined();
  });

  it("an emit-affecting config edit drops the overlay and reflects the new value", () => {
    importInto(DOC);
    expect(store().pages[0]!.overlay).toBeDefined();
    store().setLabelConfig({ widthMm: 50 });
    expect(store().pages[0]!.overlay).toBeUndefined(); // dropped -> full regen
    const out = exportZpl();
    expect(out).toContain(`^PW${50 * 8}`); // new width emitted
  });

  it("an editor-only config edit (safeAreaMm) keeps the overlay byte-identical", () => {
    const src = "^XA\n^FO50,50^A0N,30,30^FDHello^FS\n^XZ";
    importInto(src);
    store().setLabelConfig({ safeAreaMm: 3 });
    expect(store().pages[0]!.overlay).toBeDefined();
    expect(exportZpl()).toBe(src);
  });

  it("preserves a fontless-^CF field verbatim, regenerates self-contained on edit", () => {
    const src = "^XA^CF0,40^FO10,10^FDhi^FS^XZ";
    importInto(src);
    // The overlay replays the ^CF in a raw segment, so the fontless field is
    // preserved byte-identically (the old per-object raw path could not).
    expect(exportZpl()).toBe(src);
    // Editing it forces in-place regeneration with an explicit ^A at the ^CF
    // height, so the patched field is self-contained.
    const text = store().pages[0]!.objects.find((o) => o.type === "text")!;
    store().updateObject(text.id, { x: 20 });
    const out = exportZpl();
    expect(out).toContain("^FDhi");
    expect(out).toMatch(/\^A0N,40,/);
    expect(out).toContain("^FO20,");
  });
});
