import { z } from "zod";

// Request/response bridge to the hosting desktop app, reusing the two existing
// channels: requests leave as zplabEvent lines on stdout (the pipe the app
// reads, like openDraft), responses arrive on the HTTP design-response route.

const measuredFootprintSchema = z.object({
  width: z.number(),
  height: z.number(),
  barHeightDots: z.number().optional(),
  barLeftDots: z.number().optional(),
  barTopDots: z.number().optional(),
  uprightBarWDots: z.number().optional(),
  uprightBarHDots: z.number().optional(),
});

export const designResponseSchema = z.object({
  id: z.number().int(),
  designFile: z.record(z.string(), z.unknown()),
  /** Render-measured footprints (dots) keyed by object id; see ObjectBoundsCtx. */
  measured: z.record(z.string(), measuredFootprintSchema).optional(),
});
export type DesignResponse = z.infer<typeof designResponseSchema>;

/** The app answers via its Tauri event loop plus one local fetch; anything
 *  slower means no app, no listener yet (boot), or no desktop at all. */
export const APP_RESPONSE_TIMEOUT_MS = 4000;

interface Pending {
  resolve: (value: DesignResponse | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<number, Pending>();
let nextId = 1;

/** Ask the hosting app for its current design. Resolves null on timeout. */
export function requestCurrentDesign(): Promise<DesignResponse | null> {
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, APP_RESPONSE_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    process.stdout.write(JSON.stringify({ zplabEvent: "designRequest", id }) + "\n");
  });
}

/** Deliver the app's reply to the waiting request. False for an unknown or
 *  already timed-out id (a late or stray reply is a no-op). */
export function resolveDesignResponse(payload: unknown): boolean {
  const parsed = designResponseSchema.safeParse(payload);
  if (!parsed.success) return false;
  const entry = pending.get(parsed.data.id);
  if (!entry) return false;
  pending.delete(parsed.data.id);
  clearTimeout(entry.timer);
  entry.resolve(parsed.data);
  return true;
}
