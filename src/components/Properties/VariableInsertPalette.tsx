import { useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, LinkIcon } from "@heroicons/react/16/solid";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import {
  CLOCK_TOKEN_LABELS,
  clockMarkerBody,
  type ClockChannel,
} from "../../lib/fcTemplate";
import { applyClockOffset, clockOffsetIsEmpty, type ClockOffset } from "../../types/LabelConfig";
import { getVariableSource } from "../../lib/variableBinding";
import { extractTemplateRefs } from "../../lib/fnTemplate";
import {
  nextDefaultVariableName,
  nextFreeFnNumber,
  type Variable,
} from "../../types/Variable";
import type { TemplateEditorHandle } from "./TemplateContentInput";
import { ClockGlyph, SerialGlyph } from "./variableGlyphs";

const SECTION = "py-3 first:pt-0 last:pb-0";
const HEADER = "font-mono text-[9px] font-semibold uppercase tracking-wider text-muted";
const ROW = "flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:pointer-events-none";

/** Always-visible insert palette: variables (+ inline create), date/time tokens
 *  (channel cycle + offset editor) and the exclusive serial token. Drives the
 *  editor via its imperative handle; the serial button hands off to the modal
 *  (serial is a whole-field counter, not a mid-content token). */
export function VariableInsertPalette({
  editorRef,
  content,
  serialActive,
  serialEnabled,
  onActivateSerial,
  onBindWhole,
}: {
  editorRef: React.RefObject<TemplateEditorHandle | null>;
  content: string;
  serialActive: boolean;
  /** Symbology supports ^SN/^SF; GS1/MaxiCode/TLC39 hide the Serie section. */
  serialEnabled: boolean;
  onActivateSerial: () => void;
  /** Replace the whole field content with one variable marker (single-bind). */
  onBindWhole: (name: string) => void;
}) {
  const t = useT();
  const tv = t.variableBuilder;
  const variables = useLabelStore((s) => s.variables);
  const showZpl = useLabelStore((s) => s.showZplCommands);
  const addVariable = useLabelStore((s) => s.addVariable);
  const csvDataset = useLabelStore((s) => s.csvDataset);
  const csvMapping = useLabelStore((s) => s.csvMapping);
  const secondaryOffset = useLabelStore((s) => s.label.secondaryClockOffset);
  const tertiaryOffset = useLabelStore((s) => s.label.tertiaryClockOffset);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);

  const [channel, setChannel] = useState<ClockChannel>(1);
  const [offsetOpen, setOffsetOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Insert at the editor's remembered caret. mousedown-preventDefault on the
  // buttons keeps the editor focused so the caret position survives the click.
  const insert = (body: string) => editorRef.current?.insertMarker(body);

  const usedNames = new Set(extractTemplateRefs(content));
  const q = search.trim().toLowerCase();
  const shownVars = q ? variables.filter((v) => v.name.toLowerCase().includes(q)) : variables;
  const slotsLeft = nextFreeFnNumber(variables.map((v) => v.fnNumber)) !== null;
  const channelOffset = channel === 2 ? secondaryOffset : channel === 3 ? tertiaryOffset : undefined;
  const channelName =
    channel === 1 ? t.app.clockChannelPrimary : channel === 2 ? t.app.clockChannelSecondary : t.app.clockChannelTertiary;

  const previewFor = (v: Variable): { text: string; cls: string } => {
    if (getVariableSource(v, csvDataset, csvMapping) === "csv") {
      return { text: `${csvMapping?.bindings[v.id]} · CSV`, cls: "text-accent" };
    }
    return { text: v.defaultValue ? `"${v.defaultValue}"` : "", cls: "text-muted" };
  };

  // Same as the Variables tab's add: create an auto-named `var_n` (renamed
  // later in that tab), then insert its marker at the caret.
  const addAndInsert = () => {
    const id = addVariable({ name: nextDefaultVariableName(variables) });
    if (!id) return;
    const created = useLabelStore.getState().variables.find((v) => v.id === id);
    if (created) insert(created.name);
  };

  // Serial is a whole-field counter, so its presence disables every
  // mid-content insert affordance (variables, clock, search).
  const disabledBySerial = serialActive;

  return (
    <div className="flex-1 min-w-0 rounded-[9px] bg-bg border border-border px-3 divide-y divide-border">
      {/* Variables */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-sm bg-indigo shrink-0" />
            <span className={HEADER}>{tv.paletteVariableTitle}</span>
          </span>
          <span className="text-[9px] text-muted/70">{tv.manageInVariablesTab}</span>
        </div>
        {variables.length > 5 && !disabledBySerial && (
          <div className="relative mb-1">
            <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
            <input
              className="w-full bg-surface-2 border border-border rounded pl-7 pr-2 py-1 text-[11px] font-mono text-text focus:border-accent focus:outline-none"
              placeholder={t.variableField.searchVariable}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={disabledBySerial}
            />
          </div>
        )}
        {shownVars.map((v) => {
          const pv = previewFor(v);
          return (
            <div key={v.id} className="group flex items-center rounded hover:bg-surface-2 transition-colors">
              <button
                type="button"
                className="flex items-center gap-2 flex-1 min-w-0 text-left px-2 py-1 disabled:opacity-40 disabled:pointer-events-none"
                disabled={disabledBySerial}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(v.name)}
              >
                <span className="w-1.5 h-1.5 rounded-sm bg-indigo shrink-0" />
                <span className="text-xs font-mono text-indigo shrink-0">{v.name}</span>
                {pv.text && <span className={`flex-1 min-w-0 truncate text-[10px] font-mono ${pv.cls}`}>{pv.text}</span>}
                {usedNames.has(v.name) && (
                  <span className="ml-auto shrink-0 text-[8.5px] font-mono text-muted/70 border border-border rounded px-1">
                    {t.variableField.inField}
                  </span>
                )}
                {showZpl && <span className="shrink-0 text-[9px] font-mono text-muted/70">^FN{v.fnNumber}</span>}
              </button>
              {/* Secondary: bind the whole field to this variable (replace content). */}
              <button
                type="button"
                aria-label={tv.bindWhole}
                title={tv.bindWhole}
                disabled={disabledBySerial}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onBindWhole(v.name)}
                className="shrink-0 px-1.5 self-stretch text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-indigo transition-opacity disabled:opacity-0 disabled:pointer-events-none"
              >
                <LinkIcon className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {!disabledBySerial && (
          <button
            type="button"
            disabled={!slotsLeft}
            onMouseDown={(e) => e.preventDefault()}
            onClick={addAndInsert}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 mt-1 rounded text-xs font-mono border border-dashed border-border text-muted hover:text-text hover:border-border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {t.variables.add}
          </button>
        )}
      </section>

      {/* Date & time */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-sm bg-info shrink-0" />
            <span className={HEADER}>{tv.paletteDateTimeTitle}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">{t.variableField.channelLabel}</span>
            <button
              type="button"
              disabled={disabledBySerial}
              className="flex items-center gap-1 bg-surface-2 border border-border rounded px-2 py-0.5 text-[11px] text-text hover:border-accent transition-colors disabled:opacity-40"
              onClick={() => { setChannel((c) => (((c % 3) + 1) as ClockChannel)); setOffsetOpen(false); }}
            >
              {channelName}
              <span className="text-muted text-[9px]">▾</span>
            </button>
          </span>
        </div>

        {channel !== 1 && !disabledBySerial && (
          <div className="mb-1.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded border border-info/35 bg-info/10 px-2 py-1.5">
              <span className="text-info shrink-0">{ClockGlyph}</span>
              <span className="flex-1 min-w-0 text-[11px] text-text">
                {t.variableField.offsetSummary}:{" "}
                <span className="text-info">{offsetSummaryText(channelOffset, t)}</span>
              </span>
              <button type="button" className="shrink-0 text-[10px] text-muted underline hover:text-text transition-colors" onClick={() => setOffsetOpen((o) => !o)}>
                {offsetOpen ? t.variableField.offsetClose : t.variableField.offsetEdit}
              </button>
            </div>
            {offsetOpen && (
              <ClockOffsetEditor
                channel={channel === 2 ? 2 : 3}
                value={channelOffset}
                onChange={(next) => setLabelConfig(channel === 2 ? { secondaryClockOffset: next } : { tertiaryClockOffset: next })}
                t={t}
              />
            )}
          </div>
        )}

        {CLOCK_TOKEN_LABELS.map(({ token, labelKey }) => (
          <button
            key={token}
            type="button"
            className={ROW}
            disabled={disabledBySerial}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(clockMarkerBody(channel, token))}
          >
            <span className="text-info shrink-0">{ClockGlyph}</span>
            <span className="flex-1 min-w-0 text-xs text-text">{t.app[labelKey]}</span>
            {showZpl && <span className="shrink-0 text-[9px] font-mono text-muted/70">^FC</span>}
          </button>
        ))}
      </section>

      {/* Serial: hidden for symbologies ^SN/^SF would corrupt (GS1, MaxiCode, TLC39). */}
      {serialEnabled && (
      <section className={SECTION}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-sm bg-accent shrink-0" />
          <span className={HEADER}>{tv.paletteSerialTitle}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[11px] text-muted flex-1 min-w-0">{tv.serialDescription}</span>
          <button
            type="button"
            aria-pressed={serialActive}
            // Already-active is a no-op state: removal lives in the inspector
            // (× on the Serial card), so re-clicking can't clobber the restore
            // snapshot.
            disabled={serialActive}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors disabled:cursor-default ${
              serialActive ? "bg-accent text-bg border-accent" : "bg-accent-dim text-accent border-accent/60 hover:bg-accent/20"
            }`}
            onClick={onActivateSerial}
          >
            <span className="shrink-0">{SerialGlyph}</span>
            {tv.serialButton}
            {showZpl && <span className="text-[9px] opacity-70">^SN</span>}
          </button>
        </div>
      </section>
      )}
    </div>
  );
}

const hasNonZero = (o: ClockOffset | undefined): boolean => !!o && !clockOffsetIsEmpty(o);

/** Short "+2 Jahre · +3 Tage" summary of a channel's offset for the collapsed
 *  row; "0" when empty. */
function offsetSummaryText(offset: ClockOffset | undefined, t: ReturnType<typeof useT>): string {
  if (!offset) return "0";
  const parts = OFFSET_FIELDS.filter(({ key }) => offset[key]).map(({ key, labelKey }) => `+${offset[key]} ${t.app[labelKey]}`);
  return parts.length ? parts.join(" · ") : "0";
}

interface OffsetEditorProps {
  channel: 2 | 3;
  value: ClockOffset | undefined;
  onChange: (next: ClockOffset | undefined) => void;
  t: ReturnType<typeof useT>;
}

const OFFSET_FIELDS = [
  { key: "years", labelKey: "clockOffsetYears" },
  { key: "months", labelKey: "clockOffsetMonths" },
  { key: "days", labelKey: "clockOffsetDays" },
  { key: "hours", labelKey: "clockOffsetHours" },
  { key: "minutes", labelKey: "clockOffsetMinutes" },
  { key: "seconds", labelKey: "clockOffsetSeconds" },
] as const satisfies readonly { key: keyof ClockOffset; labelKey: string }[];

const QUICK_SETS = [
  { labelKey: "clockOffsetPlus1Month", offset: { months: 1 } },
  { labelKey: "clockOffsetPlus3Months", offset: { months: 3 } },
  { labelKey: "clockOffsetPlus6Months", offset: { months: 6 } },
  { labelKey: "clockOffsetPlus1Year", offset: { years: 1 } },
  { labelKey: "clockOffsetPlus2Years", offset: { years: 2 } },
] as const satisfies readonly { labelKey: string; offset: ClockOffset }[];

function ClockOffsetEditor({ channel, value, onChange, t }: OffsetEditorProps) {
  const v = value ?? {};
  const headingKey = channel === 2 ? "clockOffsetSecondaryHeading" : "clockOffsetTertiaryHeading";
  const externalText = (key: keyof ClockOffset) => v[key]?.toString() ?? "";
  const [draft, setDraft] = useState<Partial<Record<keyof ClockOffset, string>>>({});
  const [lastExternal, setLastExternal] = useState<Partial<Record<keyof ClockOffset, string>>>({});
  const currentExternal: Partial<Record<keyof ClockOffset, string>> = {
    years: externalText("years"), months: externalText("months"), days: externalText("days"),
    hours: externalText("hours"), minutes: externalText("minutes"), seconds: externalText("seconds"),
  };
  // React's "adjusting state during render" pattern: resync the draft when the
  // external offset changes (a useEffect would flash the stale draft a frame).
  if (OFFSET_FIELDS.some(({ key }) => lastExternal[key] !== currentExternal[key])) {
    setLastExternal(currentExternal);
    setDraft(currentExternal);
  }
  const update = (key: keyof ClockOffset, raw: string) => {
    setDraft((d) => ({ ...d, [key]: raw }));
    if (raw === "" || raw === "-") {
      const next = { ...v, [key]: undefined };
      const allZero = Object.values(next).every((x) => x === undefined || x === 0);
      onChange(allZero ? undefined : next);
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const next = { ...v, [key]: n === 0 ? undefined : n };
    const allZero = Object.values(next).every((x) => x === undefined || x === 0);
    onChange(allZero ? undefined : next);
  };
  const preview = hasNonZero(value)
    ? applyClockOffset(new Date(), value).toISOString().replace("T", " ").slice(0, 19)
    : null;
  return (
    <div className="border border-border rounded bg-surface-2/30 px-2 py-2 flex flex-col gap-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted">
        {t.app[headingKey]}
        <span className="ml-1 text-muted/60">^SO{channel}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {OFFSET_FIELDS.map(({ key, labelKey }) => (
          <label key={key} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted/70">{t.app[labelKey]}</span>
            <input
              type="number"
              className="w-full bg-surface border border-border rounded px-1.5 py-0.5 text-xs font-mono text-text focus:border-accent focus:outline-none"
              value={draft[key] ?? ""}
              placeholder="0"
              onChange={(e) => update(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_SETS.map(({ labelKey, offset }) => (
          <button key={labelKey} type="button" className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded text-muted hover:text-text hover:border-accent transition-colors" onClick={() => onChange(offset)}>
            {t.app[labelKey]}
          </button>
        ))}
        <button type="button" className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded text-muted hover:text-error hover:border-error transition-colors" onClick={() => onChange(undefined)}>
          {t.app.clockOffsetClear}
        </button>
      </div>
      {preview && (
        <div className="text-[10px] font-mono text-muted">
          {t.app.clockOffsetPreview}: <span className="text-text">{preview}</span>
        </div>
      )}
    </div>
  );
}
