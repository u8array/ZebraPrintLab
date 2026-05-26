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
import { CLOCK_TOKEN_LABELS } from "../../lib/fcTemplate";
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

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Optional sanitiser for restricted-charset fields (e.g. numeric-only
   *  barcodes). Applied to user-originated input only — template
   *  markers inserted via the `{x}` menu are not sanitised. */
  sanitise?: (raw: string) => string;
  placeholder?: string;
  maxLength?: number;
  /** Id of the LabelObject owning this editor. Used to scope the
   *  store's `editorFocusRequest` so that only the editor for the
   *  requested object takes focus — without this, every mounted
   *  TemplateContentInput (text, barcode1d, …) would `.focus()` on
   *  every focus request, racing the result. Omit when no focus
   *  routing is needed (e.g. test harnesses). */
  objectId?: string;
  /** Whether the value can contain newlines. Defaults to `true`
   *  (text/^FB) and screen-reader-announces "multiline edit"; pass
   *  `false` for restricted-charset single-line fields (e.g.
   *  barcode payloads where `\n` is sanitised away — a stray Enter
   *  would otherwise flicker a `<br>` into the DOM until onInput
   *  strips it). */
  multiline?: boolean;
}

/**
 * Multi-line, syntax-highlighted content editor for bindable fields.
 *
 * Implemented as a single `contenteditable` div so the selection and
 * caret sit ON the coloured marker spans directly — eliminating the
 * subpixel selection-rect misalignment of a separate-textarea +
 * mirror-layer architecture. Markers (`«…»`) are coloured per type
 * (variable = accent, clock = cyan, orphan = red wavy underline).
 *
 * Value flow:
 *  - parent passes `value` (canonical plain string with `«…»` markers)
 *  - useLayoutEffect renders that value into the editor as coloured
 *    spans, restoring the caret by character offset across the
 *    rebuild so user typing feels continuous
 *  - on input the DOM is converted back to plain text and emitted via
 *    `onChange` — letting the parent re-derive the rendered DOM
 */
const SHARED_CLS =
  "w-full min-h-[1.75rem] bg-surface-2 border border-border rounded pl-2 pr-7 py-1 text-xs font-mono leading-5 whitespace-pre-wrap break-words focus:border-accent focus:outline-none";

const SEGMENT_CLASS: Record<MarkerSegment["kind"], string> = {
  text: "",
  var: "text-accent",
  clock: "text-info",
  orphan: "text-error underline decoration-wavy decoration-error/60",
};

/** Build the editor's HTML representation of `segments`. Markers
 *  wrap in a coloured span; plain-text segments become raw text
 *  nodes; a literal `\n` becomes a bare `<br>` between siblings.
 *  Always appends a trailing placeholder `<br>` so Chrome has a
 *  caret target on the empty last line — `domToPlainText` strips
 *  the trailing placeholder so the roundtrip is symmetric. */
function segmentsToHTML(segments: MarkerSegment[]): string {
  const parts: string[] = [];
  for (const s of segments) {
    const cls = SEGMENT_CLASS[s.kind];
    if (s.kind === "text") {
      // Plain text: emit as text nodes joined by <br>, no wrapper.
      const lines = s.text.split("\n");
      lines.forEach((line, i) => {
        if (i > 0) parts.push("<br>");
        if (line !== "") parts.push(escapeHTML(line));
      });
    } else {
      // Markers never contain `\n` (the grammar `«[^»]+»` excludes
      // newlines), so a single coloured span is always correct.
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

  // Render `value` into the editor as coloured spans. Runs whenever
  // the canonical value or token classification changes; skips when
  // the DOM's plain text already matches (user typed, parent echoed
  // back) to avoid clobbering the live caret unnecessarily.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentText = domToPlainText(editor);
    if (currentText === value) {
      // DOM may still be out-of-sync on classification (e.g. variable
      // newly defined elsewhere) — only rebuild when the segment set
      // produces a different HTML.
      const desired = segmentsToHTML(segments);
      if (editor.innerHTML === desired) return;
    }
    // Save caret offset within the editor before rebuild.
    const sel = window.getSelection();
    let caretOffset: number | null = null;
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      caretOffset = getCaretOffset(editor, sel.anchorNode!, sel.anchorOffset);
    }
    editor.innerHTML = segmentsToHTML(segments);
    if (caretOffset !== null && document.activeElement === editor) {
      const pos = findCaretPosition(editor, caretOffset);
      const range = document.createRange();
      range.setStart(pos.node, pos.offset);
      range.collapse(true);
      sel!.removeAllRanges();
      sel!.addRange(range);
    }
  }, [value, segments]);

  // External focus request — e.g. a canvas double-click on the text
  // field asks the user to immediately start typing. Focus + select
  // all so the next keystroke replaces the current value (typical
  // "rename"-style affordance). Three guards:
  //  1. `editorFocusRequest === null` (steady state) → ignore.
  //  2. `editorFocusRequest.id !== objectId` → some OTHER object's
  //     editor was asked to focus; stay out of its way.
  //  3. `document.activeElement === editor` → user is already typing
  //     here. A second click would otherwise stomp the live caret +
  //     selection (typical fat-finger after the first dblclick).
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

  /** Place the editor caret at the given character `offset`. Used by
   *  every mutation path (insert / atomic delete / paste / external
   *  commit) so caret-restore logic stays in one spot. */
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

  /** Commit a value mutation triggered from a React event handler
   *  (clicks, menu selection) and schedule the caret restore for the
   *  next microtask so it runs after React's render. The native-event
   *  path uses `flushSync` + a direct call instead, because typing
   *  follow-up keys race the next event loop tick. */
  const commit = (next: string, nextCaret: number) => {
    onChange(next);
    queueMicrotask(() => restoreCaret(nextCaret));
  };

  const getCaretOffsetInEditor = (): number => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return value.length;
    if (!editor.contains(sel.anchorNode)) return value.length;
    return getCaretOffset(editor, sel.anchorNode!, sel.anchorOffset);
  };

  const insertMarker = (markerBody: string) => {
    const editor = editorRef.current;
    const marker = `«${markerBody}»`;
    const start = getCaretOffsetInEditor();
    const end = (() => {
      const sel = window.getSelection();
      if (!editor || !sel || sel.rangeCount === 0) return start;
      if (!editor.contains(sel.focusNode)) return start;
      return getCaretOffset(editor, sel.focusNode!, sel.focusOffset);
    })();
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const next = value.slice(0, lo) + marker + value.slice(hi);
    setOpen(false);
    commit(next, lo + marker.length);
  };

  // React's synthetic `onBeforeInput` does not fire reliably on
  // contenteditable in React 19 — attach a native listener instead.
  // Latest-state ref keeps the closure pure; we never re-bind.
  const stateRef = useRef({ value, onChange, sanitise, maxLength, multiline });
  useLayoutEffect(() => {
    stateRef.current = { value, onChange, sanitise, maxLength, multiline };
  });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    /** `flushSync` + sync caret restore: typing follow-up keys race a
     *  microtask-deferred restore (user types Enter+letter — the letter
     *  fires before the rebuilt DOM has its caret in place and ends up
     *  appended to the previous line). Pay the synchronous-render cost
     *  to keep ordering correct. */
    const commitInline = (next: string, nextCaret: number) => {
      flushSync(() => stateRef.current.onChange(next));
      restoreCaret(nextCaret);
    };
    /** Selection bounds (lo, hi) clamped to `editor` content; defaults
     *  to caret at end-of-value for off-editor selections. */
    const selectionRange = (fallbackLen: number) => {
      const sel = window.getSelection();
      const start = sel && editor.contains(sel.anchorNode)
        ? getCaretOffset(editor, sel.anchorNode!, sel.anchorOffset)
        : fallbackLen;
      const end = sel && editor.contains(sel.focusNode)
        ? getCaretOffset(editor, sel.focusNode!, sel.focusOffset)
        : start;
      return { lo: Math.min(start, end), hi: Math.max(start, end) };
    };
    /** Browser-native undo/redo route through zundo (global Ctrl+Z),
     *  not the contenteditable's internal undo stack — otherwise the
     *  two diverge. Intercept and drop. */
    const handleHistory = () => {
      // caller already preventDefault'd via early-return path; nothing
      // more to do.
    };
    /** Backspace/Delete adjacent to a marker boundary erodes the
     *  `«…»` mid-token into a non-resolving fragment. Intercept and
     *  delete the whole marker atomically instead. */
    const handleAtomicDelete = (direction: "backspace" | "delete") => {
      const { value } = stateRef.current;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const caret = getCaretOffset(editor, sel.anchorNode!, sel.anchorOffset);
      const m = findAtomicMarker(value, caret, direction);
      if (!m) return false;
      commitInline(value.slice(0, m.start) + value.slice(m.end), m.start);
      return true;
    };
    /** Splice `\n` into the value at the caret, then let the render
     *  effect rebuild the DOM with the right `<br>` placement. Goes
     *  through the same commitInline pipeline as atomic-delete /
     *  paste — no `document.execCommand` (deprecated, replaced by
     *  Range-based mutation through React state). */
    const handleParagraph = () => {
      const { value } = stateRef.current;
      const { lo, hi } = selectionRange(value.length);
      commitInline(value.slice(0, lo) + "\n" + value.slice(hi), lo + 1);
    };
    /** Force plain-text paste via the standard `paste` event —
     *  `beforeinput insertFromPaste` exposes `dataTransfer` only in
     *  Chromium; Firefox/Safari leave it null. `ClipboardEvent` is
     *  the cross-engine path and the same plain-text-only contract
     *  applies (sanitise + maxLength + splice into value). */
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
          // Single-line editors drop Enter; the `\n` would get
          // sanitised away and flicker a stray `<br>` in between.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Double-click a marker → select the whole `«…»` instead of the
   *  default word-boundary selection (which lands on a fragment like
   *  `name` from `«name»`). */
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
          className="absolute right-0 top-full mt-1 z-10 min-w-[10rem] max-h-64 overflow-y-auto rounded border border-border bg-surface shadow-lg"
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
          {CLOCK_TOKEN_LABELS.map(({ token, labelKey }) => (
            <button
              key={token}
              type="button"
              className="block w-full text-left px-2 py-1 text-xs font-mono text-text hover:bg-surface-2 transition-colors"
              onClick={() => insertMarker(`clock:${token}`)}
            >
              <span className="text-info">«clock:{token}»</span>{" "}
              <span className="text-muted">{t.app[labelKey]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
