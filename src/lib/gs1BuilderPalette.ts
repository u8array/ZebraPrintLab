/** Builder-palette policy over the GS1 domain core (gs1.ts). Pure; no UI. */

import { GS1_AI_SPECS, aiMatchesPattern, type Gs1AiSpec, type Gs1Group } from "./gs1";

/** Palette group order; single source for the AI_BY_GROUP index and the
 *  modal's rendering order. */
export const GS1_GROUP_ORDER: readonly Gs1Group[] = [
  "identification", "date", "batchQty", "measures",
  "logistics", "attributes", "internal", "url", "other",
];

/** Palette groups, precomputed so the modal does not re-filter per render.
 *  Every group key is present (empty array when it has no AI). */
export const AI_BY_GROUP: Record<Gs1Group, Gs1AiSpec[]> = (() => {
  const rec = Object.fromEntries(GS1_GROUP_ORDER.map((g) => [g, [] as Gs1AiSpec[]])) as Record<Gs1Group, Gs1AiSpec[]>;
  for (const s of GS1_AI_SPECS) rec[s.group].push(s);
  return rec;
})();

/** Curated everyday AIs the palette shows without a search query; the full
 *  catalog stays reachable via search. */
export const GS1_COMMON_AIS: ReadonlySet<string> = new Set([
  "01", "02", "21", "240", "241",
  "11", "13", "15", "17",
  "10", "30", "37",
  "3102", "3302",
  "00", "400", "401", "410", "413", "420",
  "90", "91",
  "8200",
]);

/** Empty-state onboarding: a use case prefills the segment list with a common
 *  AI set, everything stays editable (no wizard flow). `nameKey` resolves
 *  against the gs1builder locale block. AIs are curated to be modelable and
 *  req-satisfiable so a preset never seeds an unappliable segment. */
export interface Gs1BuilderPreset {
  nameKey: "presetShipping" | "presetBatch" | "presetSerial";
  ais: readonly string[];
}

export const GS1_BUILDER_PRESETS: readonly Gs1BuilderPreset[] = [
  { nameKey: "presetShipping", ais: ["00", "401", "403"] },
  { nameKey: "presetBatch", ais: ["01", "10", "17"] },
  { nameKey: "presetSerial", ais: ["01", "21"] },
];

/** Carriers whose encoder enforces the dictionary's req associations
 *  (bwip-verified; gs1-128 is lax since the requisite may live in another
 *  symbol on the label). The builder only opens for these types in GS1 mode,
 *  so type alone suffices. */
export const GS1_REQ_ENFORCED_TYPES: ReadonlySet<string> = new Set([
  "gs1databar",
  "datamatrix",
]);

/** Whether a req member (exact AI or 'n' wildcard) is met by any modeled AI. */
function memberModelable(member: string): boolean {
  return GS1_AI_SPECS.some((s) => aiMatchesPattern(s.ai, member));
}

/** True when some req alternative is fully modeled. AIs resting only on
 *  omitted multiComponent AIs (8111 req=255) would be unappliable dead ends
 *  on req-enforced carriers, so the palette hides them there. */
export function reqSatisfiableInBuilder(spec: Gs1AiSpec): boolean {
  if (!spec.req) return true;
  return spec.req.some((alt) => alt.every(memberModelable));
}
