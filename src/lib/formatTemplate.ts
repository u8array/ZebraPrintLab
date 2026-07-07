/** Locale-string interpolation via split/join: String.replace would expand
 *  $-patterns ($&, $', $1 ...) smuggled in by arbitrary values such as
 *  updater error messages. */
export function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(value),
    template,
  );
}
