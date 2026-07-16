// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { SerialModeCheckbox, SerialParts } from "./SerialModeSection";
import { useLabelStore } from "../../store/labelStore";
import type { SerialMode } from "../../registry/serialField";

afterEach(cleanup);

const leaf = (props: {
  content?: string;
  serial?: SerialMode;
  gs1?: boolean;
  preSerialContent?: string;
}) =>
  ({ id: "o1", type: "code128", x: 0, y: 0, props }) as Parameters<
    typeof SerialModeCheckbox
  >[0]["obj"];

const checkbox = (props: Parameters<typeof leaf>[0]) =>
  render(<SerialModeCheckbox obj={leaf(props)} onChange={vi.fn()} />).container;

describe("SerialModeCheckbox visibility", () => {
  it("hides on a gs1 field while serial is off", () => {
    expect(checkbox({ gs1: true }).querySelector("input")).toBeNull();
  });

  // Regression: the parser can import gs1 AND ^SN on one code128 field; hiding
  // the toggle then left no way to clear either flag (gs1 row is serial-gated).
  it("stays visible with gs1 set once serial is on, as the way out", () => {
    const el = checkbox({ gs1: true, serial: { increment: 1, zplMode: "SN" } });
    expect(el.querySelector("input[type=checkbox]")).not.toBeNull();
  });

  it("hides for a non-serialisable type", () => {
    const obj = { ...leaf({}), type: "ean13" };
    const el = render(<SerialModeCheckbox obj={obj} onChange={vi.fn()} />).container;
    expect(el.querySelector("input")).toBeNull();
  });
});

describe("SerialModeCheckbox toggle patches", () => {
  // Enable/disable roundtrip: ON seeds from resolved content and snapshots the
  // raw template in the same atomic patch; OFF restores the template.
  it("on: seeds and snapshots; off: restores the template", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SerialModeCheckbox obj={leaf({ content: "AB-12" })} onChange={onChange} />,
    );
    const box = () => container.querySelector("input[type=checkbox]") as Element;
    fireEvent.click(box());
    expect(onChange).toHaveBeenCalledWith({
      serial: { increment: 1, zplMode: "SN" },
      content: "AB12",
      preSerialContent: "AB-12",
    });
    rerender(
      <SerialModeCheckbox
        obj={leaf({
          content: "AB12",
          serial: { increment: 1, zplMode: "SN" },
          preSerialContent: "AB-12",
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(box());
    expect(onChange).toHaveBeenLastCalledWith({
      serial: undefined,
      preSerialContent: undefined,
      content: "AB-12",
    });
  });
});

describe("SerialParts focus request", () => {
  it("canvas dblclick focus request lands on the seed input", () => {
    const { container } = render(
      <SerialParts
        obj={leaf({ content: "A1", serial: { increment: 1, zplMode: "SN" } })}
        onChange={vi.fn()}
      />,
    );
    act(() => useLabelStore.getState().requestContentEditorFocus("o1"));
    expect(document.activeElement).toBe(container.querySelector("input:not([type=number])"));
  });
});

describe("SerialParts increment", () => {
  // Regression: ^SN/^SF take an integer increment; NumberInput's clamp lets
  // decimals through, which would emit malformed ZPL params.
  it("truncates a decimal to an integer", () => {
    const onChange = vi.fn();
    const el = render(
      <SerialParts
        obj={leaf({ content: "A1", serial: { increment: 1, zplMode: "SN" } })}
        onChange={onChange}
      />,
    ).container;
    const input = el.querySelector("input[type=number]");
    expect(input).not.toBeNull();
    fireEvent.change(input as Element, { target: { value: "2.5" } });
    expect(onChange).toHaveBeenCalledWith({ serial: { increment: 2, zplMode: "SN" } });
  });
});
