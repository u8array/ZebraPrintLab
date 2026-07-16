import { useRef, useState } from "react";
import { VariableBuilderShell } from "./VariableBuilderShell";
import {
  TemplateContentInput,
  type SelectedMarker,
  type TemplateEditorHandle,
} from "./TemplateContentInput";
import { VariableInsertPalette } from "./VariableInsertPalette";
import { VariableInspector } from "./VariableInspector";
import { VariableCsvPanel } from "./VariableCsvPanel";
import { useT } from "../../hooks/useT";
import { labelCls } from "../ui/formStyles";
import { useLabelStore, getCurrentObjects } from "../../store/labelStore";
import { findObjectById } from "../../types/Group";
import { markerOf } from "../../types/Variable";
import { fieldIsMultiline } from "../../registry/text";
import { objectResolvesCtrl, specForObject } from "../../registry";
import { contentSanitiser } from "../../registry/contentSpec";
import { removeMarkerAt } from "../../lib/markerTokens";
import { extractTemplateRefs, renameTemplateMarker } from "../../lib/fnTemplate";
import { extractClockTokens } from "../../lib/fcTemplate";
import { ctrlMarkerReGlobal } from "../../types/controlKey";

interface LeafProps {
  content?: string;
}

/** Single content editor for bindable fields: insert variable/date tokens as
 *  badges, edit their properties, and see the CSV context. Serial mode lives
 *  on the properties panel (SerialModeSection), not here. */
export function VariableBuilderModal() {
  const objectId = useLabelStore((s) => s.variableBuilderObjectId);
  if (!objectId) return null;
  // Keyed remount so the draft re-seeds from the target object.
  return <VariableBuilder key={objectId} objectId={objectId} />;
}

function VariableBuilder({ objectId }: { objectId: string }) {
  const t = useT();
  const tv = t.variableBuilder;
  const close = useLabelStore((s) => s.closeVariableBuilder);
  const updateObject = useLabelStore((s) => s.updateObject);
  const variables = useLabelStore((s) => s.variables);

  const seed = useState(() => {
    const obj = findObjectById(getCurrentObjects(), objectId);
    const p = (obj && "props" in obj ? (obj.props as LeafProps) : {}) ?? {};
    const spec = obj ? specForObject(obj) : undefined;
    return {
      content: p.content ?? "",
      controlKeysEnabled: obj ? objectResolvesCtrl(obj) : false,
      // Only block text (^FB/^TB) accepts line breaks; everything else is single-line.
      multiline: obj ? fieldIsMultiline(obj) : false,
      // Per-symbology charset filter + length cap, marker-aware.
      sanitise: spec ? contentSanitiser(spec) : undefined,
      maxLength: spec?.maxLength,
    };
  })[0];

  const [content, setContent] = useState(seed.content);
  const [selected, setSelected] = useState<SelectedMarker | null>(null);
  const editorRef = useRef<TemplateEditorHandle>(null);

  const names = new Set(variables.map((v) => v.name));

  // Live editing: the editor buffer (`content`) mirrors straight to the object,
  // so there is no draft to apply and no Apply/Cancel to mislead. Reverts go
  // through global undo, like every other surface.
  const writeContent = (next: string) => {
    setContent(next);
    updateObject(objectId, { props: { content: next } });
  };

  const onEditorChange = (next: string) => {
    writeContent(next);
    setSelected(null); // an edit can shift indices; drop the stale selection
  };

  // Inspector renamed a variable: updateVariable already rippled the rename
  // through this object's stored content, so only resync the local editor
  // buffer + selection (no second write).
  const renameInDraft = (oldName: string, newName: string) => {
    setContent((c) => renameTemplateMarker(c, oldName, newName));
    setSelected((s) => (s && s.key === oldName ? { ...s, key: newName } : s));
  };

  // Bind the whole field to one variable: content becomes exactly its marker,
  // which classifies as single-bind on emit.
  const bindWhole = (name: string) => {
    writeContent(markerOf(name));
    setSelected(null);
  };

  const removeSelected = () => {
    if (!selected) return;
    writeContent(removeMarkerAt(content, selected.index, names));
    setSelected(null);
  };

  const fnCount = extractTemplateRefs(content).filter((n) => names.has(n)).length;
  const fcCount = extractClockTokens(content).length;
  const ctrlCount = [...content.matchAll(ctrlMarkerReGlobal())].length;
  const summary = [
    fnCount > 0 ? `${fnCount} ${t.variableField.groupVariables}` : null,
    fcCount > 0 ? `${fcCount} ${t.variableField.groupDateTime}` : null,
    ctrlCount > 0 ? `${ctrlCount} ${tv.paletteControlTitle}` : null,
  ].filter(Boolean).join(" · ") || tv.summaryEmpty;

  return (
    <VariableBuilderShell
      title={tv.title}
      subtitle={tv.subtitle}
      onClose={close}
      doneLabel={tv.done}
      closeLabel={tv.close}
      footerSummary={summary}
    >
      {/* Hero editor */}
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={labelCls}>{tv.editorLabel}</span>
          <span className="text-[10px] font-mono text-muted">{summary}</span>
        </div>
        <TemplateContentInput
          ref={editorRef}
          value={content}
          onChange={onEditorChange}
          placeholder={tv.placeholder}
          objectId={objectId}
          multiline={seed.multiline}
          sanitise={seed.sanitise}
          maxLength={seed.maxLength}
          ctrlAsByte={seed.controlKeysEnabled}
          selectedIndex={selected?.index}
          onSelectMarker={setSelected}
        />
        <p className="text-[10.5px] text-muted">{tv.editorHelp}</p>
      </section>

      {/* Insert palette + contextual right column */}
      <div className="flex gap-[18px] items-start">
        <VariableInsertPalette
          editorRef={editorRef}
          content={content}
          controlKeysEnabled={seed.controlKeysEnabled}
          onBindWhole={bindWhole}
        />
        <div className="w-[256px] shrink-0 flex flex-col gap-3.5">
          <VariableInspector
            selected={selected}
            onRemoveSelected={removeSelected}
            onLeave={close}
            onRename={renameInDraft}
          />
          <VariableCsvPanel
            selectedVarName={selected?.kind === "var" ? selected.key : null}
            onLeave={close}
          />
        </div>
      </div>
    </VariableBuilderShell>
  );
}
