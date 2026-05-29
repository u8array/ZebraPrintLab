/** ^SE file-path soft-validation pattern for the HTML `pattern`
 *  attribute on the encoding-table input. Example shape:
 *  `E:UHANGUL.DAT` (canonical) or `Z:FONT.DAT,1` (with optional
 *  second param). Lives in its own module
 *  (not co-located with `EncodingAndLanguageTab.tsx`) so the
 *  React-refresh `only-export-components` rule keeps the tab a
 *  components-only file, and so the test suite can import the
 *  pattern without pulling in the component module.
 *
 *  Drive letter + colon + 1-8 char stem (alphanumeric + `_` + `-`
 *  + space) + `.DAT` extension (case-insensitive via per-letter
 *  classes) + optional comma-separated second param. Uses
 *  `String.raw` for readability: JSX attribute strings already
 *  treat backslashes as literal (HTML-attribute semantics), so
 *  the tagged template just anchors intent against a reviewer
 *  "fixing" the regex to double-backslashes (which would actually
 *  break it). */
export const SE_PATH_PATTERN =
  String.raw`[rReEbBaAzZ]:[A-Za-z0-9_\- ]{1,8}\.[dD][aA][tT](,.+)?`;
