// Firmware intercepts immediate (~) commands even inside field data, so a
// tilde opening one ends the field — but a tilde before anything else is data
// (the ^BX escape char). Lets both tokenizers keep `~1`/`~d029` in ^FD.
const ZPL_IMMEDIATE_COMMANDS: ReadonlySet<string> = new Set([
  'CC', 'CD', 'CT',
  'DB', 'DE', 'DG', 'DN', 'DS', 'DT', 'DU', 'DY',
  'EG',
  'HB', 'HD', 'HI', 'HM', 'HQ', 'HS', 'HU',
  'JA', 'JB', 'JC', 'JD', 'JE', 'JF', 'JG', 'JI', 'JL', 'JN', 'JO', 'JP',
  'JQ', 'JR', 'JS', 'JX',
  'KB',
  'NC', 'NR', 'NT',
  'PH', 'PP', 'PR', 'PS',
  'RO',
  'SD', 'SE',
  'TA',
  'WC', 'WQ',
]);

/** Whether the two chars following a tilde form a real immediate command. */
export function opensImmediateCommand(name: string): boolean {
  return ZPL_IMMEDIATE_COMMANDS.has(name.toUpperCase());
}
