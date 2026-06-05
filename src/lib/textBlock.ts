import type { TextProps } from "../registry/text";

/** Shared between manual Tekstblok checkbox and auto-activation. */
export const FB_DEFAULTS = {
  blockWidth: 400,
  blockLineSpacing: 0,
  blockJustify: "L" as const,
} satisfies Partial<TextProps>;

/** Activate ^FB with defaults on first newline; else sync blockLines on count change. */
export function deriveBlockTextPatch(
  content: string,
  prev: Pick<TextProps, "blockWidth" | "blockLines">,
): Partial<TextProps> {
  const lines = content.split("\n").length;
  const patch: Partial<TextProps> = { content };
  if (lines > 1 && !prev.blockWidth) {
    patch.blockWidth = FB_DEFAULTS.blockWidth;
    patch.blockLines = lines;
    patch.blockLineSpacing = FB_DEFAULTS.blockLineSpacing;
    patch.blockJustify = FB_DEFAULTS.blockJustify;
  } else if (prev.blockWidth && lines !== (prev.blockLines ?? 1)) {
    patch.blockLines = lines;
  }
  return patch;
}
