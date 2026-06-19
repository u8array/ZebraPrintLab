# Plan: Object Palette — ZPL command icons (power-user)

Source: claude-design handoff "Eigenschaftenmenü UX verbessern 6" (`design_handoff_palette`).
Committed into `feat/zpl-command-badges` as the build plan.

## Status of the handoff's phases

The handoff restates the full palette refresh; most of it already shipped:

- **Phase 1 (search, calmer icons, denser rows): DONE** — search + density landed
  with `feat/palette-search-favorites` (#169).
- **Phase 2 (user favorites, ☆/★, persisted slice): DONE** — same PR
  (`paletteFavorites` in `uiSlice`, persisted) + whole-row drag (#174).
- **Phase 3 (icon ⇄ ZPL command): NEW** — this is the work below.

## Phase 3 — icon slot shows the ZPL command when power-user is on

When `ui.showZplCommands` is active (the SAME flag that gates the properties-panel
badges — one switch, no separate toggle), the palette's fixed icon slot shows the
symbology's ZPL command instead of the mnemonic glyph.

- **Slot stays fixed width** (the existing `w-6`/~30px column) so the layout never
  shifts. Commands are uniformly 3 chars (`^BC`, `^GB`, …).
- **Off** = muted mnemonic glyph (current, already de-orange'd to `text-muted` with
  hover-accent). **On** = amber mono command badge (accent on accent-dim).
- **Grip (left) and star (right) unchanged.** Only the middle slot swaps content:
  `[grip] [slot] [label] [★ ml-auto]`.

## Single source for the mapping (the real lever)

Add a static `zplCmd` field to each `ObjectRegistry` type definition — ONE source
that feeds both the palette icon swap and (over time) the properties per-field
command badges, instead of the commands currently hardcoded per panel. Per
symbology exactly one primary command. ZPL codes are fixed syntax → never localized.

Mapping (primary command per type, from the generators):
Code 128 `^BC`, Code 39 `^B3`, Code 93 `^BA`, Code 11 `^B1`, I2of5 `^B2`,
Industrial 2of5 `^BI`, Standard 2of5 `^BJ`, Codabar `^BK`, LOGMARS `^BL`, MSI `^BM`,
Plessey `^BP`, GS1 Databar `^BR`, Planet `^B5`, POSTNET `^BZ`, EAN-13 `^BE`,
EAN-8 `^B8`, UPC-A `^BU`, UPC-E `^B9`, UPC/EAN supplement `^BS`, Code 49 `^B4`,
QR `^BQ`, DataMatrix `^BX`, PDF417 `^B7`, MicroPDF417 `^BF`, Aztec `^B0`,
Codablock `^BB`, Maxicode `^BV`, TLC39 `^BT`, Box `^GB`, Line `^GB`/`^GD`,
Ellipse `^GE`/`^GC`, Symbol `^GS`, Image `^GF`, Text `^A`, Serial `^SN`.
(Note: design listed Aztec `^BO`/Maxicode `^BD`; our generators emit `^B0`/`^BV`,
so use the generator values.)

## Affected files
- `src/registry/…` — `zplCmd` per type definition (single source).
- `src/components/Palette/ObjectPalette.tsx` — swap mnemonic ↔ `zplCmd` in the icon
  slot when `showZplCommands` is on; fixed slot width; amber-on-accent-dim.
- No store/locale changes (flag exists; ZPL codes are not localized).

## Out of scope
Drag/double-click (`useDraggable`, `addObject`), registry behavior, canvas. Pure
list-chrome + the registry `zplCmd` field.
