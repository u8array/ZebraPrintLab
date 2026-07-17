import { describe, it, expect, beforeEach } from "vitest";
import { useLabelStore } from "./labelStore";
import type { LabelObject } from "@zplab/core/types/Group";

const newTextObj = (id: string, content: string): LabelObject =>
  ({
    id,
    type: "text",
    x: 0,
    y: 0,
    rotation: 0,
    props: {
      content,
      fontHeight: 20,
      fontWidth: 0,
      rotation: "N",
    },
  }) as unknown as LabelObject;

describe("labelStore — template marker rename ripple", () => {
  beforeEach(() => {
    useLabelStore.setState({
      variables: [],
      pages: [{ objects: [] }],
      currentPageIndex: 0,
    } as Partial<ReturnType<typeof useLabelStore.getState>>);
  });

  it("rewrites every «oldName» marker when a variable is renamed", () => {
    const id = useLabelStore.getState().addVariable({ name: "sku" });
    expect(id).not.toBeNull();
    useLabelStore.setState({
      pages: [
        {
          objects: [
            newTextObj("a", "lone «sku»"),
            newTextObj("b", "two «sku» and «sku» again"),
            newTextObj("c", "untouched literal"),
          ],
        },
      ],
    } as Partial<ReturnType<typeof useLabelStore.getState>>);

    useLabelStore.getState().updateVariable(id!, { name: "product" });

    const objs = useLabelStore.getState().pages[0]!.objects as LabelObject[];
    expect((objs[0] as { props: { content: string } }).props.content)
      .toBe("lone «product»");
    expect((objs[1] as { props: { content: string } }).props.content)
      .toBe("two «product» and «product» again");
    expect((objs[2] as { props: { content: string } }).props.content)
      .toBe("untouched literal");
  });

  it("preserves object identity when the rename does not touch a leaf", () => {
    const id = useLabelStore.getState().addVariable({ name: "sku" });
    const before = newTextObj("a", "no markers here");
    useLabelStore.setState({
      pages: [{ objects: [before] }],
    } as Partial<ReturnType<typeof useLabelStore.getState>>);

    useLabelStore.getState().updateVariable(id!, { name: "product" });

    const after = useLabelStore.getState().pages[0]!.objects[0];
    expect(after).toBe(before);
  });

  it("leaves markers untouched when the rename target name is unchanged", () => {
    const id = useLabelStore.getState().addVariable({ name: "sku" });
    const obj = newTextObj("a", "value: «sku»");
    useLabelStore.setState({
      pages: [{ objects: [obj] }],
    } as Partial<ReturnType<typeof useLabelStore.getState>>);

    useLabelStore.getState().updateVariable(id!, { name: "sku" });

    const after = useLabelStore.getState().pages[0]!.objects[0];
    expect(after).toBe(obj);
  });
});
