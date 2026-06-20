import { useState } from "react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { BarcodeContentModalShell } from "./BarcodeContentModalShell";
import { useT } from "../../lib/useT";
import { inputCls } from "../ui/formStyles";
import { useLabelStore, getCurrentObjects } from "../../store/labelStore";
import { findObjectById } from "../../types/Group";
import {
  AI_BY_GROUP,
  aiSpec,
  isVariableKind,
  validateGs1Segment,
  validateGs1Segments,
  segmentsToElementString,
  segmentsToContent,
  parseGs1ToSegments,
  GS1_GS,
  type Gs1AiSpec,
  type Gs1Group,
  type Gs1Segment,
} from "../../lib/gs1";

const GROUP_ORDER: Gs1Group[] = ["identification", "date", "batchQty", "measures"];

/** Compact GS1 format token for a field (not localized; GS1 notation). */
function formatHint(spec: Gs1AiSpec): string {
  switch (spec.kind) {
    case "gtin": return "n14";
    case "date": return "YYMMDD";
    case "fixedNum": return `n${spec.len}`;
    case "varNum": return `n..${spec.len}`;
    case "varAlnum": return `an..${spec.len}`;
  }
}

export function Gs1ContentModal() {
  const objectId = useLabelStore((s) => s.gs1BuilderObjectId);
  if (!objectId) return null;
  // Keyed remount per target so the segment draft re-seeds from that object.
  return <Gs1Builder key={objectId} objectId={objectId} />;
}

function Gs1Builder({ objectId }: { objectId: string }) {
  const t = useT();
  const closeGs1Builder = useLabelStore((s) => s.closeGs1Builder);
  const updateObject = useLabelStore((s) => s.updateObject);

  const [segments, setSegments] = useState<Gs1Segment[]>(() => {
    const obj = findObjectById(getCurrentObjects(), objectId);
    const content = (obj && "props" in obj ? (obj.props as { content?: string }).content : "") ?? "";
    return parseGs1ToSegments(content) ?? [];
  });

  const tg = t.gs1builder;
  const aiName = (ai: string): string =>
    (tg as Record<string, string>)[`aiName${ai}`] ?? ai;
  const errMsg = (code: string): string =>
    (tg as Record<string, string>)[`err${code.charAt(0).toUpperCase()}${code.slice(1)}`] ?? code;

  const errors = segments.map((s) => validateGs1Segment(s.ai, s.value));
  const fieldsOk = segments.length > 0 && errors.every((e) => e === null);
  const setError = validateGs1Segments(segments);
  const valid = fieldsOk && setError === null;

  const addSegment = (ai: string) => setSegments((prev) => [...prev, { ai, value: "" }]);
  const setValue = (i: number, value: string) =>
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, value } : s)));
  const removeAt = (i: number) => setSegments((prev) => prev.filter((_, j) => j !== i));

  const apply = () => {
    updateObject(objectId, { props: { content: segmentsToContent(segments) } });
    closeGs1Builder();
  };

  // FNC1 follows a variable AI that is not the last segment.
  const fnc1After = (i: number): boolean => {
    const seg = segments[i];
    const spec = seg ? aiSpec(seg.ai) : undefined;
    return !!spec && isVariableKind(spec.kind) && i < segments.length - 1;
  };

  return (
    <BarcodeContentModalShell
      title={tg.title}
      subtitle={tg.subtitle}
      onClose={closeGs1Builder}
      onApply={apply}
      applyDisabled={!valid}
      applyLabel={tg.apply}
      cancelLabel={tg.cancel}
      closeLabel={tg.close}
    >
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{tg.paletteHeading}</h3>
        {GROUP_ORDER.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <span className="text-[10px] text-muted/70">
              {(tg as Record<string, string>)[`group${group.charAt(0).toUpperCase()}${group.slice(1)}`]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {AI_BY_GROUP[group].map((spec) => (
                <button
                  key={spec.ai}
                  type="button"
                  onClick={() => addSegment(spec.ai)}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border text-xs transition-colors"
                >
                  <PlusIcon className="w-3 h-3 text-muted" />
                  <span className="font-mono text-[10px] text-accent">({spec.ai})</span>
                  <span className="text-text">{aiName(spec.ai)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{tg.segmentsHeading}</h3>
        {segments.length === 0 ? (
          <p className="text-xs text-muted px-1">{tg.emptyHint}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {segments.map((seg, i) => {
              const spec = aiSpec(seg.ai);
              const err = errors[i];
              return (
                <li key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-accent-dim text-accent rounded px-1 py-0.5 shrink-0">({seg.ai})</span>
                    <span className="text-xs text-text shrink-0 w-28 truncate">{aiName(seg.ai)}</span>
                    <span className="font-mono text-[10px] text-muted shrink-0">{spec ? formatHint(spec) : ""}</span>
                    <input
                      className={`${inputCls} flex-1 ${err ? "border-error" : ""}`}
                      value={seg.value}
                      onChange={(e) => setValue(i, e.target.value)}
                      aria-label={aiName(seg.ai)}
                    />
                    {fnc1After(i) && (
                      <span className="font-mono text-[9px] text-muted shrink-0" title={tg.fnc1}>FNC1</span>
                    )}
                    <button type="button" aria-label={tg.remove} onClick={() => removeAt(i)} className="text-muted hover:text-error shrink-0">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {err ? (
                    <span className="text-[10px] text-error pl-1">{errMsg(err)}</span>
                  ) : spec?.kind === "gtin" && seg.value.length > 0 && seg.value.length < 14 ? (
                    <span className="text-[10px] text-muted pl-1">{tg.gtinAutocomplete}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {fieldsOk && setError && setError !== "empty" && (
        <p className="text-[10px] text-error px-1">{errMsg(setError)}</p>
      )}

      {valid && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted">{tg.elementLabel}</span>
            <code className="text-xs font-mono text-text break-all bg-surface-2 rounded px-2 py-1">
              {segmentsToElementString(segments)}
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted">{tg.rawLabel}</span>
            <code className="text-xs font-mono text-text break-all bg-surface-2 rounded px-2 py-1">
              {segmentsToContent(segments).replaceAll(GS1_GS, "⟨GS⟩")}
            </code>
          </div>
        </section>
      )}
    </BarcodeContentModalShell>
  );
}
