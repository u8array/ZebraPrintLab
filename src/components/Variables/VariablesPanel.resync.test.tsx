// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { VariablesPanel } from "./VariablesPanel";
import { useLabelStore } from "../../store/labelStore";
import { fallbackTranslations as en } from "../../locales";

afterEach(cleanup);

const VAR = { id: "v1", name: "sku", fnNumber: 1, defaultValue: "X" };

function nameInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `input[aria-label="${en.variables.nameLabel}"]`,
  );
  if (!el) throw new Error("name input not found");
  return el;
}

// Regression: the row's local input mirror never resynced on external store
// updates (undo, file load, MCP push); a later blur then wrote the stale
// values back over the update.
describe("VariableRow external resync", () => {
  it("reflects an external rename in the input and keeps blur from reverting it", () => {
    act(() => {
      useLabelStore.setState({ variables: [VAR] });
    });
    const { container } = render(<VariablesPanel />);
    expect(nameInput(container).value).toBe("sku");

    act(() => {
      useLabelStore.setState({ variables: [{ ...VAR, name: "gtin" }] });
    });
    expect(nameInput(container).value).toBe("gtin");

    fireEvent.blur(nameInput(container));
    expect(useLabelStore.getState().variables[0]?.name).toBe("gtin");
  });

  // Regression: a rejected edit set a row error, but an external update to the
  // same variable refreshed the value without clearing the now-stale hint.
  it("clears a stale row error when the variable is updated externally", () => {
    act(() => {
      useLabelStore.setState({
        variables: [VAR, { id: "v2", name: "gtin", fnNumber: 2, defaultValue: "" }],
      });
    });
    const { container, queryByText } = render(<VariablesPanel />);
    const input = nameInput(container); // first row = v1

    // Rename v1 onto the existing "gtin" -> rejected -> row error shown.
    fireEvent.change(input, { target: { value: "gtin" } });
    fireEvent.blur(input);
    expect(queryByText(en.variables.nameInUse)).not.toBeNull();

    // External update to v1 must drop the stale rejection hint.
    act(() => {
      useLabelStore.setState({
        variables: [
          { ...VAR, name: "sku2" },
          { id: "v2", name: "gtin", fnNumber: 2, defaultValue: "" },
        ],
      });
    });
    expect(queryByText(en.variables.nameInUse)).toBeNull();
  });
});

const csvSource = (filename: string) => ({
  kind: "csv" as const,
  filename,
  importedAt: "",
  encoding: "utf-8",
  delimiter: ",",
  rowCount: 1,
});

// Regression: the destructive "Discard" confirm was a bare bool, so a document
// swap while it was open could resurface it and clearDataset a newer dataset.
describe("VariablesPanel discard confirm context guard", () => {
  it("drops the stale discard confirm when the data context changes", () => {
    act(() => {
      useLabelStore.setState({ variables: [VAR] });
      useLabelStore.getState().loadDataset({ headers: ["a"], rows: [["1"]], source: csvSource("d1.csv") });
    });
    const { queryByText, getByLabelText } = render(<VariablesPanel />);

    act(() => {
      fireEvent.click(getByLabelText(en.variables.csvBadgeDiscardCsv));
    });
    expect(queryByText(en.variables.csvDiscardConfirmAction)).not.toBeNull();

    // A new dataset lands (document swap / reload) -> stale confirm must vanish
    // and must not have wiped the new dataset.
    act(() => {
      useLabelStore.getState().loadDataset({ headers: ["a"], rows: [["1"]], source: csvSource("d2.csv") });
    });
    expect(queryByText(en.variables.csvDiscardConfirmAction)).toBeNull();
    expect(useLabelStore.getState().dataset?.source.kind).toBe("csv");
  });
});
