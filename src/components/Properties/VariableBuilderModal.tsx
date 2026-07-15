import { useRef, useState } from "react";
import { VariableBuilderShell } from "./VariableBuilderShell";
import {
  TemplateContentInput,
  editorBoxCls,
  type SelectedMarker,
  type TemplateEditorHandle,
} from "./TemplateContentInput";
import { VariableInsertPalette } from "./VariableInsertPalette";
import { VariableInspector } from "./VariableInspector";
import { VariableCsvPanel } from "./VariableCsvPanel";
import { SerialGlyph } from "./variableGlyphs";
import { useT } from "../../hooks/useT";
import { labelCls } from "../ui/formStyles";
import { useLabelStore, getCurrentObjects } from "../../store/labelStore";
import { findObjectById } from "../../types/Group";
import { markerOf } from "../../types/Variable";
import { serialSeed, type SerialMode, SERIAL_DEFAULT } from "../../registry/serialField";
import { fieldIsMultiline } from "../../registry/text";
import { getEntry, objectResolvesCtrl } from "../../registry";
import { contentSanitiser, resolveContentSpec } from "../../registry/contentSpec";
import { removeMarkerAt } from "../../lib/markerTokens";
import { extractTemplateRefs, renameTemplateMarker } from "../../lib/fnTemplate";
import { extractClockTokens } from "../../lib/fcTemplate";
import { resolveContentPreview } from "../../lib/variableBinding";
import { ctrlMarkerReGlobal } from "../../types/controlKey";

interface LeafProps {
  content?: string;
  serial?: SerialMode;
}

/** Single content editor for bindable fields: insert variable/date/serial tokens
 *  as badges, edit their properties, and see the CSV context. Replaces the inline
 *  {x} popover and the bind-whole dropdown. */
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
  const showZpl = useLabelStore((s) => s.showZplCommands);
  const secondaryOffset = useLabelStore((s) => s.label.secondaryClockOffset);
  const tertiaryOffset = useLabelStore((s) => s.label.tertiaryClockOffset);

  const seed = useState(() => {
    const obj = findObjectById(getCurrentObjects(), objectId);
    const p = (obj && "props" in obj ? (obj.props as LeafProps) : {}) ?? {};
    const spec = obj ? resolveContentSpec(getEntry(obj.type)?.contentSpec, p) : undefined;
    return {
      content: p.content ?? "",
      serialOn: !!p.serial,
      serial: p.serial ?? { ...SERIAL_DEFAULT },
      // Whether this symbology's emitter honours ^SN/^SF. Stable per type, so
      // reading it once at open is enough (the modal is keyed by objectId).
      serialEnabled: obj ? (getEntry(obj.type)?.serialisable ?? false) : false,
      controlKeysEnabled: obj ? objectResolvesCtrl(obj) : false,
      // Only block text (^FB/^TB) accepts line breaks; everything else is single-line.
      multiline: obj ? fieldIsMultiline(obj) : false,
      // Per-symbology charset filter + length cap, marker-aware.
      sanitise: spec ? contentSanitiser(spec) : undefined,
      maxLength: spec?.maxLength,
      contentSpec: spec,
    };
  })[0];

  const [content, setContent] = useState(seed.content);
  const [serialOn, setSerialOn] = useState(seed.serialOn);
  const [serial, setSerial] = useState<SerialMode>(seed.serial);
  const [selected, setSelected] = useState<SelectedMarker | null>(null);
  // Content before serial activation, so toggling serial off restores the
  // original markers/template instead of leaving the derived literal seed.
  const [preSerialContent, setPreSerialContent] = useState<string | null>(null);
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

  // Serial seed from the field's current PRINTABLE value, not its marker syntax:
  // resolve markers to their defaults first (so «sku» becomes the default, not
  // "sku"), then keep only serial-legal chars.
  const seedFromContent = (raw: string): string =>
    serialSeed(
      // Emitter parity: chips resolve to bytes only where export would too.
      resolveContentPreview(raw, variables, { secondaryOffset, tertiaryOffset }, {
        resolveCtrl: seed.controlKeysEnabled,
      }),
      seed.contentSpec,
    );

  const activateSerial = () => {
    // Idempotent: a second activation while already serial would overwrite the
    // restore snapshot with the seed and lose the original template.
    if (serialOn) return;
    const seedVal = seedFromContent(content);
    setSerialOn(true);
    setPreSerialContent(content);
    setContent(seedVal);
    setSelected(null);
    updateObject(objectId, { props: { serial, content: serialSeed(seedVal, seed.contentSpec) } });
  };

  const removeSerial = () => {
    setSerialOn(false);
    // Restore the markers/template the seed was derived from (unless the field
    // was already serial on open, where there's nothing to restore).
    const restored = preSerialContent !== null ? preSerialContent : content;
    setContent(restored);
    setPreSerialContent(null);
    setSelected(null);
    updateObject(objectId, { props: { serial: undefined, content: restored } });
  };

  const removeSelected = () => {
    if (!selected) return;
    writeContent(removeMarkerAt(content, selected.index, names));
    setSelected(null);
  };

  // Serial seed edits keep the seed charset-filtered; content IS the seed.
  const changeSeed = (v: string) => {
    const next = serialSeed(v, seed.contentSpec);
    setContent(next);
    updateObject(objectId, { props: { serial, content: next } });
  };

  const changeSerial = (patch: Partial<SerialMode>) => {
    const next = { ...serial, ...patch };
    setSerial(next);
    updateObject(objectId, { props: { serial: next } });
  };

  const fnCount = extractTemplateRefs(content).filter((n) => names.has(n)).length;
  const fcCount = extractClockTokens(content).length;
  const ctrlCount = [...content.matchAll(ctrlMarkerReGlobal())].length;
  const summary = serialOn
    ? tv.serialActive
    : [
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
          {serialOn ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent border border-accent/60 bg-accent-dim rounded pl-1.5 pr-1 py-0.5">
              {SerialGlyph}
              {tv.serialActive}
              {showZpl && <span className="opacity-70">^SN</span>}
              <button type="button" aria-label={tv.remove} className="ml-0.5 leading-none hover:text-error" onClick={removeSerial}>
                ×
              </button>
            </span>
          ) : (
            <span className="text-[10px] font-mono text-muted">{summary}</span>
          )}
        </div>
        {serialOn ? (
          // Serial is a whole-field counter: the editor is locked to the seed;
          // start value / increment are edited in the inspector. The mode is
          // signalled by the "Serial active" marker in the label row above.
          <div className={`${editorBoxCls} min-h-[172px] opacity-70 cursor-not-allowed`} aria-readonly="true">
            {content || <span className="text-muted">{tv.serialSeedPlaceholder}</span>}
          </div>
        ) : (
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
        )}
        <p className="text-[10.5px] text-muted">{serialOn ? tv.serialHelp : tv.editorHelp}</p>
      </section>

      {/* Insert palette + contextual right column */}
      <div className="flex gap-[18px] items-start">
        <VariableInsertPalette
          editorRef={editorRef}
          content={content}
          serialActive={serialOn}
          serialEnabled={seed.serialEnabled}
          controlKeysEnabled={seed.controlKeysEnabled}
          onActivateSerial={activateSerial}
          onBindWhole={bindWhole}
        />
        <div className="w-[256px] shrink-0 flex flex-col gap-3.5">
          <VariableInspector
            selected={selected}
            serialActive={serialOn}
            serial={serial}
            serialSeed={content}
            onChangeSeed={changeSeed}
            onChangeSerial={changeSerial}
            onRemoveSerial={removeSerial}
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
