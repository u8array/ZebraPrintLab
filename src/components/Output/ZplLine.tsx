import { tokenizeZplLine, type ZplTokenType } from "../../lib/zplTokenize";

/** Tailwind colour per ZPL token type (see index.css theme tokens). */
const TOKEN_CLASS: Record<ZplTokenType, string> = {
  structural: "text-accent font-semibold",
  command: "text-accent font-medium",
  fieldData: "text-string",
  comment: "text-muted italic",
  number: "text-info",
  enum: "text-text",
  separator: "text-muted",
  text: "text-muted",
};

/** One line of rendered ZPL, syntax-highlighted per token. Shared between
 *  the per-label ZPL pane and the Setup-Script preview pane. */
export function ZplLine({ line }: { line: string }) {
  const tokens = tokenizeZplLine(line);
  return (
    <span className="block">
      {/* A blank line collapses to zero height inside <pre>; keep its row. */}
      {tokens.length === 0
        ? "\n"
        : tokens.map((tok, i) => (
            <span key={i} className={TOKEN_CLASS[tok.type]}>
              {tok.value}
            </span>
          ))}
    </span>
  );
}
