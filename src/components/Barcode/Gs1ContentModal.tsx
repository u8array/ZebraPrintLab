import { useState } from "react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { BarcodeContentModalShell } from "./BarcodeContentModalShell";
import { useT } from "../../lib/useT";
import type { Translations } from "../../locales";
import { inputCls } from "../ui/formStyles";
import { Tooltip } from "../ui/Tooltip";
import { useLabelStore, getCurrentObjects } from "../../store/labelStore";
import { findObjectById } from "../../types/Group";
import {
  aiSpec,
  isVariableKind,
  validateGs1Segment,
  validateGs1Segments,
  segmentsToElementString,
  segmentsToContent,
  parseGs1ToSegments,
  decimalValuePreview,
  GS1_GS,
  type Gs1AiSpec,
  type Gs1Segment,
  type Gs1SetError,
} from "../../lib/gs1";
import {
  AI_BY_GROUP,
  GS1_GROUP_ORDER,
  GS1_COMMON_AIS,
  GS1_REQ_ENFORCED_TYPES,
  reqSatisfiableInBuilder,
} from "../../lib/gs1BuilderPalette";

/** Long-tail count for the palette hint: offerable catalog minus the curated
 *  set (all common AIs are satisfiable, guarded by test). */
function hiddenAiCount(enforceReq: boolean): number {
  const total = Object.values(AI_BY_GROUP)
    .flat()
    .filter((s) => !enforceReq || reqSatisfiableInBuilder(s)).length;
  return total - GS1_COMMON_AIS.size;
}

type Gs1BuilderStrings = Translations["gs1builder"];

/** Localized AI display name: per-AI key, else the decimal family's shared
 *  key, else the catalog EN title, else the AI number. */
function aiName(tg: Gs1BuilderStrings, ai: string): string {
  const loc = tg as Record<string, string>;
  const spec = aiSpec(ai);
  const family = spec?.kind === "decimal" ? loc[`aiNameFamily${ai.slice(0, 3)}`] : undefined;
  // `||` on the title so an empty catalog title (8110/8112) still falls to the AI number.
  return loc[`aiName${ai}`] ?? family ?? (spec?.title || ai);
}

function fieldErrMsg(tg: Gs1BuilderStrings, code: string): string {
  return (tg as Record<string, string>)[`err${code.charAt(0).toUpperCase()}${code.slice(1)}`] ?? code;
}

function setErrMsg(tg: Gs1BuilderStrings, e: Gs1SetError): string {
  if (e.key === "exclusiveAis")
    return tg.errExclusiveFmt.replace("{a}", e.ai).replace("{b}", e.other);
  if (e.key === "missingRequired")
    return tg.errRequiresFmt
      .replace("{ai}", e.ai)
      .replace("{list}", e.alternatives.map((alt) => alt.map((m) => `(${m})`).join("+")).join(" / "));
  return fieldErrMsg(tg, e.key);
}

/** Compact GS1 format token for a field (not localized; GS1 notation). */
function formatHint(spec: Gs1AiSpec): string {
  switch (spec.kind) {
    case "gtin": return "n14";
    case "date": return spec.len === 8 ? "YYYYMMDD" : "YYMMDD";
    case "fixedNum": return `n${spec.len}`;
    // Implied point lives in the AI, so show the integer+fraction split.
    case "decimal": return spec.decimalPlaces ? `n${spec.len - spec.decimalPlaces}+${spec.decimalPlaces}` : `n${spec.len}`;
    case "fixedAlnum": return `an${spec.len}`;
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

  const obj = findObjectById(getCurrentObjects(), objectId);
  const [segments, setSegments] = useState<Gs1Segment[]>(() => {
    const content = (obj && "props" in obj ? (obj.props as { content?: string }).content : "") ?? "";
    return parseGs1ToSegments(content) ?? [];
  });
  const enforceReq = GS1_REQ_ENFORCED_TYPES.has(obj?.type ?? "");

  const tg = t.gs1builder;
  const [query, setQuery] = useState("");

  const errors = segments.map((s) => validateGs1Segment(s.ai, s.value));
  const fieldsOk = segments.length > 0 && errors.every((e) => e === null);
  const setError = validateGs1Segments(segments, enforceReq);
  const valid = fieldsOk && setError === null;

  const addSegment = (ai: string) => setSegments((prev) => [...prev, { ai, value: "" }]);
  const setValue = (i: number, value: string) =>
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, value } : s)));
  const removeAt = (i: number) => setSegments((prev) => prev.filter((_, j) => j !== i));

  const apply = () => {
    // Builder writes a literal GS1 string, overwriting any prior `«name»` marker
    // so the field is no longer single-bound.
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{tg.paletteHeading}</h3>
          <input
            className={`${inputCls} w-40 py-0.5 text-xs`}
            placeholder={tg.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tg.searchPlaceholder}
          />
        </div>
        {GS1_GROUP_ORDER.map((group) => {
          const q = query.trim().toLowerCase();
          // No query shows only the curated set; search spans the catalog.
          // Req-enforced carriers hide AIs whose requisites aren't modeled
          // (adding one would be an unappliable dead end).
          const matches = AI_BY_GROUP[group].filter(
            (spec) =>
              (!enforceReq || reqSatisfiableInBuilder(spec)) &&
              (q
                ? spec.ai.includes(q) ||
                  aiName(tg, spec.ai).toLowerCase().includes(q) ||
                  spec.title.toLowerCase().includes(q)
                : GS1_COMMON_AIS.has(spec.ai)),
          );
          if (matches.length === 0) return null;
          return (
          <div key={group} className="flex flex-col gap-1">
            <span className="text-[10px] text-muted/70">
              {(tg as Record<string, string>)[`group${group.charAt(0).toUpperCase()}${group.slice(1)}`]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {matches.map((spec) => (
                <button
                  key={spec.ai}
                  type="button"
                  onClick={() => addSegment(spec.ai)}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-surface-2 hover:bg-border text-xs transition-colors"
                >
                  <PlusIcon className="w-3 h-3 text-muted" />
                  <span className="font-mono text-[10px] text-accent">({spec.ai})</span>
                  <span className="text-text">{aiName(tg, spec.ai)}</span>
                </button>
              ))}
            </div>
          </div>
          );
        })}
        {query.trim() === "" && (
          <span className="text-[10px] text-muted/70">
            {tg.moreViaSearchFmt.replace("{n}", String(hiddenAiCount(enforceReq)))}
          </span>
        )}
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
              const decPreview = spec?.kind === "decimal" ? decimalValuePreview(seg.ai, seg.value) : null;
              return (
                <li key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-accent-dim text-accent rounded px-1 py-0.5 shrink-0">({seg.ai})</span>
                    <span className="text-xs text-text shrink-0 w-28 truncate">{aiName(tg, seg.ai)}</span>
                    <span className="font-mono text-[10px] text-muted shrink-0">{spec ? formatHint(spec) : ""}</span>
                    <input
                      className={`${inputCls} flex-1 ${err ? "border-error" : ""}`}
                      value={seg.value}
                      onChange={(e) => setValue(i, e.target.value)}
                      aria-label={aiName(tg, seg.ai)}
                    />
                    {fnc1After(i) && (
                      <Tooltip content={tg.fnc1} className="shrink-0">
                        <span className="font-mono text-[9px] text-muted">FNC1</span>
                      </Tooltip>
                    )}
                    <button type="button" aria-label={tg.remove} onClick={() => removeAt(i)} className="text-muted hover:text-error shrink-0">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {err ? (
                    <span className="text-[10px] text-error pl-1">{fieldErrMsg(tg, err)}</span>
                  ) : spec?.kind === "gtin" && seg.value.length > 0 && seg.value.length < 14 ? (
                    <span className="text-[10px] text-muted pl-1">{tg.gtinAutocomplete}</span>
                  ) : decPreview ? (
                    <span className="text-[10px] text-muted pl-1">= {decPreview}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {fieldsOk && setError && setError.key !== "empty" && (
        <p className="text-[10px] text-error px-1">{setErrMsg(tg, setError)}</p>
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
