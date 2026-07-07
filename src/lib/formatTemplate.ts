/** Locale-string interpolation. Single pass over the template so a value that
 *  itself contains a `{key}` is never re-substituted, and the replacer function
 *  form is immune to $-pattern expansion ($&, $', $1 ...) from arbitrary values
 *  such as updater error messages. */
export function formatTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) =>
    Object.hasOwn(values, key) ? values[key] ?? match : match,
  );
}
