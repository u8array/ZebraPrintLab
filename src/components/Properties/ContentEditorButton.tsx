import { useLabelStore } from "../../store/labelStore";
import { useT } from "../../hooks/useT";
import type { BindableLeaf } from "../../lib/variableField";
import { fieldIsMultiline } from "../../registry/text";
import { objectResolvesCtrl, specForObject } from "../../registry";
import { contentSanitiser } from "../../registry/contentSpec";
import { TemplateContentInput } from "./TemplateContentInput";

/** Properties-panel entry point for a bindable field's content (handoff variant
 *  A): the field is editable inline (plain text plus `«name»` chips), with a
 *  docked `{x}` launcher that opens the full Variable-Builder modal. Replaces
 *  the old full-width "Edit content" button and the inline {x} popover. */
export function ContentEditorButton({ obj }: { obj: BindableLeaf }) {
  const t = useT();
  const open = useLabelStore((s) => s.openVariableBuilder);
  const updateObject = useLabelStore((s) => s.updateObject);
  const content = obj.props.content ?? "";
  // Per-symbology charset/length, so restrictive barcodes filter inline input
  // (the panel's own validation still warns on length).
  const spec = specForObject(obj);
  return (
    <div className="flex items-stretch bg-surface-2 border border-border rounded-md overflow-hidden focus-within:border-accent">
      <TemplateContentInput
        value={content}
        onChange={(next) => updateObject(obj.id, { props: { content: next } })}
        objectId={obj.id}
        multiline={fieldIsMultiline(obj)}
        sanitise={spec ? contentSanitiser(spec) : undefined}
        maxLength={spec?.maxLength}
        ctrlAsByte={objectResolvesCtrl(obj)}
        placeholder={t.variableBuilder.placeholder}
        boxClassName="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-xs font-mono leading-6 break-words focus:outline-none"
      />
      <button
        type="button"
        onClick={() => open(obj.id)}
        title={t.variableBuilder.launcherTitle}
        aria-label={t.variableBuilder.launcherTitle}
        className="w-8 shrink-0 self-stretch border-l border-border bg-surface text-accent font-mono text-[13px] font-semibold hover:bg-surface-2 transition-colors"
      >
        {"{x}"}
      </button>
    </div>
  );
}
