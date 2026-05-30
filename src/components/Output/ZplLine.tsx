/** One line of rendered ZPL with `^CMD` tokens highlighted in the
 *  accent color. Shared between the per-label ZPL pane in
 *  `ZPLOutput` and the Setup-Script preview pane in the Printer
 *  Settings modal so any future tweak (e.g. handling `~CMD` or
 *  lowercase commands) lands in one place. */
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
