import { describe, it, expect } from "vitest";
import {
  classifyField,
  fieldMode,
  fieldHasVariable,
  fieldVariableRefs,
  fieldTokenSummary,
  countBindings,
  boundDefaultOrContent,
} from "@zplab/core/lib/variableField";
import type { Variable } from "@zplab/core/types/Variable";
import type { LabelObject } from "@zplab/core/types/Group";

const sku: Variable = { id: "v1", name: "sku", fnNumber: 1, defaultValue: "DEFAULT" };
const lot: Variable = { id: "v2", name: "lot", fnNumber: 7, defaultValue: "L7" };
const vars = [sku, lot];

// Content is the only state now: single-bind is content === one lone known marker.
const obj = (content: string): LabelObject =>
  ({
    id: "o1",
    type: "text",
    x: 0,
    y: 0,
    props: { content },
  }) as unknown as LabelObject;

describe("fieldMode", () => {
  it("single / template / literal / empty", () => {
    expect(fieldMode(obj("«sku»"), vars)).toBe("single");
    expect(fieldMode(obj("«sku» x"), vars)).toBe("template");
    expect(fieldMode(obj("plain"), vars)).toBe("literal");
    expect(fieldMode(obj(""), vars)).toBe("empty");
  });
  it("a lone unknown marker is not single", () => {
    expect(fieldMode(obj("«ghost»"), vars)).toBe("template");
  });
});

describe("fieldHasVariable", () => {
  // Gates literal-only affordances in the panels (length/EAN checks,
  // typed-content builders) which must not fire once a variable is present.
  it("true for single-bind and template, false for literal and empty", () => {
    expect(fieldHasVariable(obj("«sku»"), vars)).toBe(true);
    expect(fieldHasVariable(obj("«sku» x"), vars)).toBe(true);
    expect(fieldHasVariable(obj("plain"), vars)).toBe(false);
    expect(fieldHasVariable(obj(""), vars)).toBe(false);
  });
});

describe("fieldVariableRefs", () => {
  it("returns the single-bind variable", () => {
    expect(fieldVariableRefs(obj("«sku»"), vars)).toEqual([sku]);
  });
  it("returns deduped known marker refs, excluding clock and orphan", () => {
    expect(fieldVariableRefs(obj("«sku»«lot»«sku»«clock:T»«ghost»"), vars)).toEqual([
      sku,
      lot,
    ]);
  });
});

describe("fieldTokenSummary", () => {
  it("single-bind counts one ^FN", () => {
    expect(fieldTokenSummary(obj("«sku»"), vars)).toEqual({ fn: 1, fc: 0 });
  });
  it("template counts known vars and clock tokens", () => {
    expect(fieldTokenSummary(obj("«sku»«lot»«clock:T»«ghost»"), vars)).toEqual({
      fn: 2,
      fc: 1,
    });
  });
});

describe("boundDefaultOrContent", () => {
  it("returns the variable's CURRENT default for a single-bind field", () => {
    expect(boundDefaultOrContent(obj("«sku»"), vars)).toBe("DEFAULT");
  });
  it("returns content for a literal field", () => {
    expect(boundDefaultOrContent(obj("98765432"), vars)).toBe("98765432");
  });
  it("returns the raw content for a lone unknown marker (not single-bind)", () => {
    expect(boundDefaultOrContent(obj("«ghost»"), vars)).toBe("«ghost»");
  });
});

describe("countBindings", () => {
  const page = (objects: LabelObject[]) => ({ objects });

  it("counts a single-bind reference", () => {
    const counts = countBindings([page([obj("«sku»")])], vars);
    expect(counts.get("v1")).toBe(1);
    expect(counts.has("v2")).toBe(false);
  });

  it("counts a template marker reference by name", () => {
    const counts = countBindings([page([obj("«sku» «lot»")])], vars);
    expect(counts.get("v1")).toBe(1);
    expect(counts.get("v2")).toBe(1);
  });

  it("counts a field that repeats the same marker once", () => {
    const counts = countBindings([page([obj("«sku»«sku»")])], vars);
    expect(counts.get("v1")).toBe(1);
  });

  it("ignores unknown marker names", () => {
    const counts = countBindings([page([obj("«missing»")])], vars);
    expect(counts.size).toBe(0);
  });

  it("tallies across multiple pages and objects", () => {
    const counts = countBindings(
      [page([obj("«sku»"), obj("«sku»")]), page([obj("«lot»")])],
      vars,
    );
    expect(counts.get("v1")).toBe(2);
    expect(counts.get("v2")).toBe(1);
  });

  it("descends into nested groups", () => {
    const group = {
      id: "g1",
      type: "group",
      x: 0,
      y: 0,
      children: [obj("«sku»"), { id: "g2", type: "group", x: 0, y: 0, children: [obj("«lot»")] }],
    } as unknown as LabelObject;
    const counts = countBindings([page([group])], vars);
    expect(counts.get("v1")).toBe(1);
    expect(counts.get("v2")).toBe(1);
  });
});

describe("classifyField (content-only, variableId-free)", () => {
  it("exactly one known marker is single-bind", () => {
    const c = classifyField("«sku»", vars);
    expect(c.kind).toBe("single");
    expect(c.kind === "single" && c.variable.id).toBe("v1");
  });

  it("a single unknown marker is not single (template, no refs)", () => {
    const c = classifyField("«nope»", vars);
    expect(c.kind).toBe("template");
    expect(c.kind === "template" && c.refs).toEqual([]);
  });

  it("marker plus surrounding text is template", () => {
    const c = classifyField("SKU «sku»", vars);
    expect(c.kind).toBe("template");
    expect(c.kind === "template" && c.refs.map((v) => v.id)).toEqual(["v1"]);
  });

  it("multiple markers are template with deduped known refs", () => {
    const c = classifyField("«sku»«lot»«sku»", vars);
    expect(c.kind).toBe("template");
    expect(c.kind === "template" && c.refs.map((v) => v.id)).toEqual(["v1", "v2"]);
  });

  it("clock-only content is template with no variable refs", () => {
    const c = classifyField("«clock:Y»", vars);
    expect(c.kind).toBe("template");
    expect(c.kind === "template" && c.refs).toEqual([]);
  });

  it("plain text is literal", () => {
    expect(classifyField("hello", vars).kind).toBe("literal");
  });

  it("empty content is literal", () => {
    expect(classifyField("", vars).kind).toBe("literal");
  });
});
