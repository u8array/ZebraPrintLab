import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { flushSync } from "react-dom";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { CLOCK_TOKEN_LABELS, type ClockChannel } from "../../lib/fcTemplate";
import { applyClockOffset, clockOffsetIsEmpty, type ClockOffset } from "../../types/LabelConfig";
import {
  findAtomicMarker,
  findMarkerContaining,
  tokeniseMarkers,
  type MarkerSegment,
} from "../../lib/markerTokens";
import {
  domToPlainText,
  findCaretPosition,
  getCaretOffset,
} from "../../lib/contentEditableCaret";
import type { Variable } from "../../types/Variable";

/** Caret offset within `editor`, or null when selection isn't inside it. */
function caretOffsetIn(
  editor: HTMLElement,
  sel: Selection | null,
  which: "anchor" | "focus" = "anchor",
): number | null {
  if (!sel || sel.rangeCount === 0) return null;
  const node = which === "anchor" ? sel.anchorNode : sel.focusNode;
  const offset = which === "anchor" ? sel.anchorOffset : sel.focusOffset;
  if (!node || !editor.contains(node)) return null;
  return getCaretOffset(editor, node, offset);
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** User input only; marker insertions skip sanitise. */
  sanitise?: (raw: string) => string;
  placeholder?: string;
  maxLength?: number;
  /** Scopes editorFocusRequest so only the matching editor focuses. */
  objectId?: string;
  /** False for single-line restricted-charset fields. */
  multiline?: boolean;
}

/** contenteditable div with coloured marker spans. Parent owns canonical
 *  plain string; useLayoutEffect rebuilds DOM and restores caret offset. */
const SHARED_CLS =
  "w-full min-h-[1.75rem] bg-surface-2 border border-border rounded pl-2 pr-7 py-1 text-xs font-mono leading-5 whitespace-pre-wrap break-words focus:border-accent focus:outline-none";

const SEGMENT_CLASS: Record<MarkerSegment["kind"], string> = {
  text: "",
  var: "text-accent",
  clock: "text-info",
  orphan: "text-error underline decoration-wavy decoration-error/60",
};

/** Trailing `<br>` placeholder gives Chrome a caret target on empty last
 *  line; domToPlainText strips it symmetrically. */
function segmentsToHTML(segments: MarkerSegment[]): string {
  const parts: string[] = [];
  for (const s of segments) {
    const cls = SEGMENT_CLASS[s.kind];
    if (s.kind === "text") {
      const lines = s.text.split("\n");
      lines.forEach((line, i) => {
        if (i > 0) parts.push("<br>");
        if (line !== "") parts.push(escapeHTML(line));
      });
    } else {
      // Markers exclude `\n` per grammar `«[^»]+»`.
      parts.push(`<span class="${cls}">${escapeHTML(s.text)}</span>`);
    }
  }
  parts.push("<br>"); // trailing placeholder, stripped by domToPlainText
  return parts.join("");
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function TemplateContentInput({
  value,
  onChange,
  sanitise,
  placeholder,
  maxLength,
  objectId,
  multiline = true,
}: Props) {
  const t = useT();
  const variables = useLabelStore((s) => s.variables);
  const editorFocusRequest = useLabelStore((s) => s.editorFocusRequest);
  const secondaryOffset = useLabelStore((s) => s.label.secondaryClockOffset);
  const tertiaryOffset = useLabelStore((s) => s.label.tertiaryClockOffset);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const [channel, setChannel] = useState<ClockChannel>(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [open, setOpen] = useState(false);

  const variableNames = useMemo(
    () => new Set(variables.map((v: Variable) => v.name)),
    [variables],
  );
  const segments = useMemo(
    () => tokeniseMarkers(value, variableNames),
    [value, variableNames],
  );

  // Skip rebuild when DOM plain text already matches; avoids clobbering caret.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentText = domToPlainText(editor);
    if (currentText === value) {
      // Classification may shift (new variable defined elsewhere).
      const desired = segmentsToHTML(segments);
      if (editor.innerHTML === desired) return;
    }
    const caretOffset = caretOffsetIn(editor, window.getSelection());
    editor.innerHTML = segmentsToHTML(segments);
    if (caretOffset !== null && document.activeElement === editor) {
      const selAfter = window.getSelection();
      if (selAfter) {
        const pos = findCaretPosition(editor, caretOffset);
        const range = document.createRange();
        range.setStart(pos.node, pos.offset);
        range.collapse(true);
        selAfter.removeAllRanges();
        selAfter.addRange(range);
      }
    }
  }, [value, segments]);

  // External focus request (canvas dblclick): focus + selectAll for rename.
  useEffect(() => {
    if (!editorFocusRequest || editorFocusRequest.id !== objectId) return;
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editorFocusRequest, objectId]);

  // Click-outside + Esc close. Mounted only while the {x} menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const restoreCaret = (offset: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const pos = findCaretPosition(editor, offset);
    const range = document.createRange();
    range.setStart(pos.node, pos.offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  /** React-event path; microtask defers caret restore after React render. */
  const commit = (next: string, nextCaret: number) => {
    onChange(next);
    queueMicrotask(() => restoreCaret(nextCaret));
  };

  const getCaretOffsetInEditor = (): number => {
    const editor = editorRef.current;
    if (!editor) return value.length;
    return caretOffsetIn(editor, window.getSelection()) ?? value.length;
  };

  const insertMarker = (markerBody: string) => {
    const editor = editorRef.current;
    const marker = `«${markerBody}»`;
    const start = getCaretOffsetInEditor();
    const end = editor
      ? (caretOffsetIn(editor, window.getSelection(), "focus") ?? start)
      : start;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const next = value.slice(0, lo) + marker + value.slice(hi);
    setOpen(false);
    commit(next, lo + marker.length);
  };

  // React 19 onBeforeInput is unreliable on contenteditable; native listener
  // with latest-state ref so closure stays stable.
  const stateRef = useRef({ value, onChange, sanitise, maxLength, multiline });
  useLayoutEffect(() => {
    stateRef.current = { value, onChange, sanitise, maxLength, multiline };
  });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    /** Sync render+restore so follow-up keys land on the rebuilt DOM. */
    const commitInline = (next: string, nextCaret: number) => {
      flushSync(() => stateRef.current.onChange(next));
      restoreCaret(nextCaret);
    };
    const selectionRange = (fallbackLen: number) => {
      const sel = window.getSelection();
      const start = caretOffsetIn(editor, sel, "anchor") ?? fallbackLen;
      const end = caretOffsetIn(editor, sel, "focus") ?? start;
      return { lo: Math.min(start, end), hi: Math.max(start, end) };
    };
    /** Drop browser undo/redo; zundo owns history. */
    const handleHistory = () => {
      // caller already preventDefault'd via early-return path.
    };
    /** Delete the whole `«...»` marker atomically rather than eroding mid-token. */
    const handleAtomicDelete = (direction: "backspace" | "delete") => {
      const { value } = stateRef.current;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const caret = caretOffsetIn(editor, sel);
      if (caret === null) return false;
      const m = findAtomicMarker(value, caret, direction);
      if (!m) return false;
      commitInline(value.slice(0, m.start) + value.slice(m.end), m.start);
      return true;
    };
    const handleParagraph = () => {
      const { value } = stateRef.current;
      const { lo, hi } = selectionRange(value.length);
      commitInline(value.slice(0, lo) + "\n" + value.slice(hi), lo + 1);
    };
    /** ClipboardEvent for cross-engine plain-text paste; FF/Safari lack
     *  dataTransfer on beforeinput insertFromPaste. */
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const { value, sanitise, maxLength } = stateRef.current;
      const data = e.clipboardData?.getData("text/plain") ?? "";
      if (!data) return;
      const clean = sanitise ? sanitise(data) : data;
      const { lo, hi } = selectionRange(value.length);
      let toInsert = clean;
      if (maxLength !== undefined) {
        const room = maxLength - (value.length - (hi - lo));
        toInsert = toInsert.slice(0, Math.max(0, room));
      }
      commitInline(value.slice(0, lo) + toInsert + value.slice(hi), lo + toInsert.length);
    };
    const handler = (e: InputEvent) => {
      if (composingRef.current) return;
      switch (e.inputType) {
        case "historyUndo":
        case "historyRedo":
          e.preventDefault();
          handleHistory();
          return;
        case "insertParagraph":
          // Single-line drops Enter; sanitise would otherwise flicker a stray <br>.
          e.preventDefault();
          if (stateRef.current.multiline) handleParagraph();
          return;
        case "deleteContentBackward":
        case "deleteContentForward": {
          const direction = e.inputType === "deleteContentBackward" ? "backspace" : "delete";
          if (handleAtomicDelete(direction)) e.preventDefault();
          return;
        }
      }
    };
    editor.addEventListener("beforeinput", handler);
    editor.addEventListener("paste", handlePaste);
    return () => {
      editor.removeEventListener("beforeinput", handler);
      editor.removeEventListener("paste", handlePaste);
    };
  }, []);

  const onInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (composingRef.current) return;
    let next = domToPlainText(editor);
    if (sanitise) next = sanitise(next);
    if (maxLength !== undefined && next.length > maxLength) next = next.slice(0, maxLength);
    if (next === value) return;
    onChange(next);
  };

  const onCompositionEnd = () => {
    composingRef.current = false;
    onInput();
  };

  /** Select the whole `«...»` instead of word-boundary fragment. */
  const onDoubleClick = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const caret = getCaretOffsetInEditor();
    const m = findMarkerContaining(value, caret);
    if (!m) return;
    const startPos = findCaretPosition(editor, m.start);
    const endPos = findCaretPosition(editor, m.end);
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const isEmpty = value.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        aria-label={placeholder ?? t.app.insertVariable}
        data-placeholder={isEmpty ? placeholder : undefined}
        spellCheck={false}
        className={`${SHARED_CLS} relative block caret-text empty:before:content-[attr(data-placeholder)] empty:before:text-muted empty:before:pointer-events-none`}
        onInput={onInput}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={onCompositionEnd}
        onDoubleClick={onDoubleClick}
      />
      <button
        type="button"
        className="absolute top-1 right-1 px-1.5 rounded text-[10px] font-mono bg-surface border border-border text-muted hover:text-text hover:border-accent transition-colors"
        title={t.app.insertVariable}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {"{x}"}
      </button>
      {open && (
        <div
          className={`absolute right-0 top-full mt-1 z-10 max-h-[28rem] overflow-y-auto rounded border border-border bg-surface shadow-lg ${
            channel === 1 ? "min-w-[10rem]" : "min-w-[18rem]"
          }`}
          role="menu"
        >
          {variables.length > 0 && (
            <>
              {variables.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="block w-full text-left px-2 py-1 text-xs font-mono text-accent hover:bg-surface-2 transition-colors"
                  onClick={() => insertMarker(v.name)}
                >
                  «{v.name}»
                </button>
              ))}
              <div className="border-t border-border my-1" />
            </>
          )}
          <ClockChannelTabs
            active={channel}
            secondaryConfigured={hasNonZero(secondaryOffset)}
            tertiaryConfigured={hasNonZero(tertiaryOffset)}
            onChange={setChannel}
            t={t}
          />
          {CLOCK_TOKEN_LABELS.map(({ token, labelKey }) => (
            <button
              key={token}
              type="button"
              className="block w-full text-left px-2 py-1 text-xs font-mono text-text hover:bg-surface-2 transition-colors"
              onClick={() => insertMarker(markerBodyFor(channel, token))}
            >
              <span className="text-info">«{markerBodyFor(channel, token)}»</span>{" "}
              <span className="text-muted">{t.app[labelKey]}</span>
            </button>
          ))}
          {channel !== 1 && (
            <ClockOffsetEditor
              channel={channel}
              value={channel === 2 ? secondaryOffset : tertiaryOffset}
              onChange={(next) =>
                setLabelConfig(
                  channel === 2
                    ? { secondaryClockOffset: next }
                    : { tertiaryClockOffset: next },
                )
              }
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

function markerBodyFor(channel: ClockChannel, token: string): string {
  return channel === 1 ? `clock:${token}` : `clock${channel}:${token}`;
}

const hasNonZero = (o: ClockOffset | undefined): boolean => !!o && !clockOffsetIsEmpty(o);

interface TabsProps {
  active: ClockChannel;
  secondaryConfigured: boolean;
  tertiaryConfigured: boolean;
  onChange: (next: ClockChannel) => void;
  t: ReturnType<typeof useT>;
}

function ClockChannelTabs({ active, secondaryConfigured, tertiaryConfigured, onChange, t }: TabsProps) {
  const tab = (channel: ClockChannel, label: string, configured: boolean) => {
    const isActive = active === channel;
    return (
      <button
        type="button"
        className={`flex-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider border-b-2 transition-colors ${
          isActive
            ? "text-text border-accent"
            : "text-muted border-transparent hover:text-text"
        }`}
        onClick={() => onChange(channel)}
      >
        {label}
        {configured && <span className="ml-1 text-accent">●</span>}
      </button>
    );
  };
  return (
    <div className="flex border-b border-border bg-surface-2/50">
      {tab(1, t.app.clockChannelPrimary, false)}
      {tab(2, t.app.clockChannelSecondary, secondaryConfigured)}
      {tab(3, t.app.clockChannelTertiary, tertiaryConfigured)}
    </div>
  );
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
  const headingKey = channel === 2
    ? "clockOffsetSecondaryHeading"
    : "clockOffsetTertiaryHeading";
  // Local draft buffer so intermediate states like "-" or "" don't
  // collapse to undefined and clear the input mid-typing.
  const externalText = (key: keyof ClockOffset) => v[key]?.toString() ?? "";
  const [draft, setDraft] = useState<Partial<Record<keyof ClockOffset, string>>>({});
  const [lastExternal, setLastExternal] = useState<Partial<Record<keyof ClockOffset, string>>>({});
  const currentExternal: Partial<Record<keyof ClockOffset, string>> = {
    years: externalText("years"), months: externalText("months"), days: externalText("days"),
    hours: externalText("hours"), minutes: externalText("minutes"), seconds: externalText("seconds"),
  };
  if (
    OFFSET_FIELDS.some(({ key }) => lastExternal[key] !== currentExternal[key])
  ) {
    setLastExternal(currentExternal);
    setDraft(currentExternal);
  }
  const update = (key: keyof ClockOffset, raw: string) => {
    setDraft((d) => ({ ...d, [key]: raw }));
    // Empty or sign-only stays in the draft; don't commit yet.
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
  const preview = useMemo(() => {
    if (!hasNonZero(value)) return null;
    return applyClockOffset(new Date(), value).toISOString().replace("T", " ").slice(0, 19);
  }, [value]);
  return (
    <div className="border-t border-border bg-surface-2/30 px-2 py-2 flex flex-col gap-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted">
        {t.app[headingKey]}
        <span className="ml-1 text-muted/60">^SO{channel}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {OFFSET_FIELDS.map(({ key, labelKey }) => (
          <label key={key} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted/70">
              {t.app[labelKey]}
            </span>
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
          <button
            key={labelKey}
            type="button"
            className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded text-muted hover:text-text hover:border-accent transition-colors"
            onClick={() => onChange(offset)}
          >
            {t.app[labelKey]}
          </button>
        ))}
        <button
          type="button"
          className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded text-muted hover:text-error hover:border-error transition-colors"
          onClick={() => onChange(undefined)}
        >
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
