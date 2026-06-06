/** One line of rendered ZPL with `^CMD` tokens highlighted in the
 *  accent color. Shared between the per-label ZPL pane and the
 *  Setup-Script preview pane. */
export function ZplLine({ line }: { line: string }) {
  const parts = line.split(/([\^][A-Z0-9]+)/g);
  return (
    <span className="block">
      {parts.map((part, i) =>
        /^\^[A-Z0-9]+$/.test(part)
          ? <span key={i} className="text-accent">{part}</span>
          : <span key={i} className="text-text">{part}</span>
      )}
    </span>
  );
}
