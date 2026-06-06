import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { FONT_LINKS_MAX_PER_BASE } from "../../types/PrinterProfile";
import { SafeStringInput, ZplCommandLabel, ZplField, ZplFieldHint } from "./zplFieldPrimitives";

function overflowingBases(links: readonly { base: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const l of links) {
    const key = l.base.trim();
    if (key.length === 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > FONT_LINKS_MAX_PER_BASE).map(([b]) => b);
}

/** ^FL font-link editor; each row is one (ext, base) pair. */
export function FontLinksField() {
  const t = useT();
  const loc = t.printerSettings.encodingLanguage;
  const profile = useLabelStore((s) => s.printerProfile);
  const patch = useLabelStore((s) => s.patchPrinterProfile);
  const links = profile.fontLinks ?? [];
  const overflowing = overflowingBases(links);

  const setLinks = (next: { ext: string; base: string }[]) => {
    patch({ fontLinks: next.length > 0 ? next : undefined });
  };
  const updateRow = (i: number, patchRow: Partial<{ ext: string; base: string }>) => {
    setLinks(links.map((x, idx) => idx === i ? { ...x, ...patchRow } : x));
  };

  return (
    <ZplField>
      <ZplCommandLabel text={loc.fontLinks} command="^FL" />
      <ZplFieldHint>{loc.fontLinksHint}</ZplFieldHint>
      {links.length === 0 && (
        <p className="font-mono text-[10px] text-muted/70">{loc.fontLinksEmpty}</p>
      )}
      {overflowing.length > 0 && (
        <p className="font-mono text-[10px] text-warning">
          {loc.fontLinksOverLimitFmt.replaceAll("{bases}", overflowing.join(", "))}
        </p>
      )}
      {links.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
          <SafeStringInput
            value={l.ext}
            placeholder={loc.fontLinksExt}
            onChange={(v) => updateRow(i, { ext: v })}
          />
          <SafeStringInput
            value={l.base}
            placeholder={loc.fontLinksBase}
            onChange={(v) => updateRow(i, { base: v })}
          />
          <button
            type="button"
            className="font-mono text-[10px] text-muted hover:text-red-400 px-1"
            onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
            aria-label={loc.fontLinksRemove}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="font-mono text-[10px] text-accent hover:text-accent-bright self-start"
        onClick={() => setLinks([...links, { ext: "", base: "" }])}
      >
        + {loc.fontLinksAdd}
      </button>
    </ZplField>
  );
}
