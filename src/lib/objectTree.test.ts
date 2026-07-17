import { describe, it, expect } from "vitest";
import { sanitiseVariableNames } from "@zplab/core/lib/objectTree";

const page = (content: string) => ({ objects: [{ type: "text", props: { content } }] });
const contentOf = (p: { objects: { props: { content: string } }[] }) => p.objects[0]!.props.content;

describe("sanitiseVariableNames", () => {
  it("renames a reserved name to field_<fn> and rewrites its markers", () => {
    const vars = [
      { id: "a", name: "clock:Y", fnNumber: 1 },
      { id: "b", name: "ok", fnNumber: 2 },
    ];
    const pages = [page("«clock:Y» and «ok»")];
    sanitiseVariableNames(vars, pages);
    expect(vars.map((v) => v.name)).toEqual(["field_1", "ok"]);
    expect(contentOf(pages[0]!)).toBe("«field_1» and «ok»");
  });

  it("renames a name with marker delimiters (no clean marker can reference it)", () => {
    const vars = [{ id: "a", name: "sku»oops", fnNumber: 5 }];
    const pages = [page("plain")];
    sanitiseVariableNames(vars, pages);
    expect(vars[0]!.name).toBe("field_5");
  });

  it("trims valid names without renaming", () => {
    const vars = [{ id: "a", name: "  sku  ", fnNumber: 1 }];
    const pages = [page("«sku»")];
    sanitiseVariableNames(vars, pages);
    expect(vars[0]!.name).toBe("sku");
    expect(contentOf(pages[0]!)).toBe("«sku»");
  });

  it("dedupes valid names, including trim-induced collisions", () => {
    const vars = [
      { id: "a", name: "sku", fnNumber: 1 },
      { id: "b", name: " sku ", fnNumber: 2 },
    ];
    const pages = [page("«sku» « sku »")];
    sanitiseVariableNames(vars, pages);
    expect(vars.map((v) => v.name)).toEqual(["sku", "sku_2"]);
    expect(contentOf(pages[0]!)).toBe("«sku» «sku_2»");
  });

  it("dedupes exact-duplicate names without hijacking the keeper's markers", () => {
    // Two variables literally named "sku": the first keeps the name and owns the
    // «sku» markers; only the duplicate is renamed. Rewriting «sku» globally
    // would silently rebind the field to the duplicate on load.
    const vars = [
      { id: "a", name: "sku", fnNumber: 1 },
      { id: "b", name: "sku", fnNumber: 2 },
    ];
    const pages = [page("«sku»")];
    sanitiseVariableNames(vars, pages);
    expect(vars.map((v) => v.name)).toEqual(["sku", "sku_2"]);
    expect(contentOf(pages[0]!)).toBe("«sku»");
  });

  it("avoids colliding the fallback with an existing valid name", () => {
    const vars = [
      { id: "a", name: "field_1", fnNumber: 7 },
      { id: "b", name: "clock:Y", fnNumber: 1 },
    ];
    const pages = [page("«field_1» «clock:Y»")];
    sanitiseVariableNames(vars, pages);
    expect(vars[1]!.name).toBe("field_1_2");
    expect(contentOf(pages[0]!)).toBe("«field_1» «field_1_2»");
  });
});
