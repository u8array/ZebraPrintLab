import { describe, it, expect, beforeAll } from "vitest";
import { domToPlainText, getCaretOffset, findCaretPosition } from "./contentEditableCaret";

// The helpers walk a DOM tree but only touch nodeType / nodeValue /
// childNodes / tagName / parentNode. Mock just enough for unit tests
// without pulling in jsdom or happy-dom.

beforeAll(() => {
  (globalThis as unknown as { Node: { TEXT_NODE: number; ELEMENT_NODE: number } }).Node = {
    TEXT_NODE: 3,
    ELEMENT_NODE: 1,
  };
});

interface MockNode {
  nodeType: number;
  nodeValue?: string;
  tagName?: string;
  childNodes: MockNode[];
  parentNode?: MockNode;
}

const text = (v: string): MockNode => ({ nodeType: 3, nodeValue: v, childNodes: [] });
const br = (): MockNode => ({ nodeType: 1, tagName: "BR", childNodes: [] });
const el = (tag: string, children: MockNode[] = []): MockNode => {
  const node: MockNode = { nodeType: 1, tagName: tag.toUpperCase(), childNodes: children };
  for (const c of children) c.parentNode = node;
  return node;
};
const root = (children: MockNode[]): MockNode => el("DIV", children);
const span = (s: string): MockNode => el("SPAN", [text(s)]);

describe("domToPlainText", () => {
  it("concatenates text from sibling spans", () => {
    expect(domToPlainText(root([span("Hello "), span("World")]) as unknown as Node)).toBe("Hello World");
  });

  it("treats <br> as a newline between siblings", () => {
    expect(domToPlainText(root([span("a"), br(), span("b")]) as unknown as Node)).toBe("a\nb");
  });

  it("returns empty string for empty root", () => {
    expect(domToPlainText(root([]) as unknown as Node)).toBe("");
  });

  it("descends into nested elements", () => {
    const inner = el("EM", [text("there")]);
    expect(domToPlainText(root([el("SPAN", [text("Hi "), inner])]) as unknown as Node)).toBe("Hi there");
  });

  it("strips a trailing <br> as the Chrome caret-placeholder", () => {
    // segmentsToHTML always appends a trailing <br> so Chrome's caret
    // has somewhere to land on the empty last line; that BR does not
    // represent a real \n and should not appear in the value.
    expect(domToPlainText(root([text("A"), br()]) as unknown as Node)).toBe("A");
    expect(domToPlainText(root([text("A"), br(), br()]) as unknown as Node)).toBe("A\n");
    expect(domToPlainText(root([br()]) as unknown as Node)).toBe("");
  });
});

describe("getCaretOffset", () => {
  it("counts text in earlier siblings plus offset in the current text node", () => {
    const t1 = text("Hello ");
    const t2 = text("World");
    const r = root([el("SPAN", [t1]), el("SPAN", [t2])]);
    expect(getCaretOffset(r as unknown as Node, t2 as unknown as Node, 3)).toBe(9);
  });

  it("returns 0 at the start of the first text node", () => {
    const t1 = text("Hello");
    const r = root([el("SPAN", [t1])]);
    expect(getCaretOffset(r as unknown as Node, t1 as unknown as Node, 0)).toBe(0);
  });

  it("counts BR as one character", () => {
    const t1 = text("a");
    const t2 = text("b");
    const r = root([el("SPAN", [t1]), br(), el("SPAN", [t2])]);
    expect(getCaretOffset(r as unknown as Node, t2 as unknown as Node, 1)).toBe(3);
  });

  it("counts element-node caret by child-index", () => {
    const r = root([span("Hello "), span("World")]);
    // Caret between the two child spans → element offset 1
    expect(getCaretOffset(r as unknown as Node, r as unknown as Node, 1)).toBe(6);
  });
});

describe("findCaretPosition", () => {
  it("lands inside the right text node for a mid-range offset", () => {
    const t1 = text("Hello ");
    const t2 = text("World");
    const r = root([el("SPAN", [t1]), el("SPAN", [t2])]);
    const pos = findCaretPosition(r as unknown as Node, 9);
    expect(pos.node).toBe(t2 as unknown as Node);
    expect(pos.offset).toBe(3);
  });

  it("lands at the start of the first text node for offset 0", () => {
    const t1 = text("abc");
    const r = root([el("SPAN", [t1])]);
    const pos = findCaretPosition(r as unknown as Node, 0);
    expect(pos.node).toBe(t1 as unknown as Node);
    expect(pos.offset).toBe(0);
  });

  it("lands at the end of the last text node for offset === length", () => {
    const t1 = text("abc");
    const r = root([el("SPAN", [t1])]);
    const pos = findCaretPosition(r as unknown as Node, 3);
    expect(pos.node).toBe(t1 as unknown as Node);
    expect(pos.offset).toBe(3);
  });

  it("clamps to end of root for out-of-range offsets", () => {
    const t1 = text("abc");
    const r = root([el("SPAN", [t1])]);
    const pos = findCaretPosition(r as unknown as Node, 999);
    expect(pos.node).toBe(r as unknown as Node);
  });

  it("places caret right AFTER a <br> (so typing lands on the next line)", () => {
    const t1 = text("a");
    const brEl = br();
    // Single-span wrapper mirrors the editor's output shape after Enter
    const wrapperSpan = el("SPAN", [t1, brEl]);
    const r = root([wrapperSpan]);
    // After "a\n" (offset 2): caret should be inside the span at index 2
    // (text "a" at index 0, <br> at index 1, position 2 = after BR)
    const pos = findCaretPosition(r as unknown as Node, 2);
    expect(pos.node).toBe(wrapperSpan as unknown as Node);
    expect(pos.offset).toBe(2);
  });

  it("round-trips: offset → caret → offset across a marker-like structure", () => {
    // "Hi «name» there" with a marker span in the middle
    const r = root([span("Hi "), span("«name»"), span(" there")]);
    const full = domToPlainText(r as unknown as Node);
    expect(full).toBe("Hi «name» there");
    for (let i = 0; i <= full.length; i += 1) {
      const pos = findCaretPosition(r as unknown as Node, i);
      const back = getCaretOffset(r as unknown as Node, pos.node, pos.offset);
      expect(back).toBe(i);
    }
  });
});
