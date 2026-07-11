/** Centralises the `e instanceof Error ? ... : String(e)` coercion every
 *  Tauri/async call site would otherwise repeat. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
