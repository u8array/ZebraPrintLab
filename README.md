# ZPL Label Designer

Browser-based ZPL II label editor. Open-source alternative to ZebraDesigner, NiceLabel, and BarTender.

**[Try it](https://u8array.github.io/zpl_label_designer/)** · [Report an issue](https://github.com/u8array/zpl_label_designer/issues)

> Early development. Core editing works, ZPL import is incomplete.

---

![Screenshot: main editor](_screenshots/editor.png)
<!-- placeholder: replace with actual screenshot -->

---

## Usage

### 1. Set up the label

The label dimensions and print resolution are shown in the header (`width × height mm · dpmm`). Click on them to adjust.

Common print resolutions: 6 dpmm (152 dpi), 8 dpmm (203 dpi), 12 dpmm (300 dpi), 24 dpmm (600 dpi).

### 2. Add objects

Drag items from the left panel onto the canvas, or click them to add at the center.

Available objects: text, serial (auto-incrementing fields), barcodes (Code 128, Code 39, Code 93, I2of5, EAN-13, EAN-8, UPC-A, UPC-E, QR Code, DataMatrix, PDF417), shapes (box, line, ellipse), and images.

### 3. Edit properties

Select an object to configure it in the **Properties** panel on the right: content, size, font, barcode options, etc.

Multiple objects can be selected by holding Shift or drawing a lasso. Position and size changes apply to all selected objects.

### 4. Get the ZPL

The ZPL output panel at the bottom updates in real time. From there:

- **Copy**: copies the ZPL to the clipboard
- **Preview**: fetches a rendered preview image from [Labelary](https://labelary.com/) (requires internet)
- **Export**: downloads a `.zpl` file (File menu)
- **Print**: opens the Labelary preview and triggers the browser print dialog

### Importing existing ZPL

File menu → **Import ZPL**: paste ZPL code directly, or open a `.zpl` file.

The parser covers the most common ZPL II commands:

- **Text:** `^A0`, `^A*` (all bitmap fonts), `^A@` (TrueType, best-effort sizing), `^CF`, `^FW`, `^FB` (field block, including `\&` line breaks), `^TB`, `^FH` (hex escapes)
- **Barcodes:** `^BC` (Code 128), `^B3` (Code 39), `^BA` (Code 93), `^B2` (I2of5), `^BE` (EAN-13), `^B8` (EAN-8), `^BU` (UPC-A), `^B9` (UPC-E), `^BQ` (QR Code), `^BX` (DataMatrix), `^B7` (PDF417)
- **Serialization:** `^SN`, `^SF` (imported as serial objects)
- **Graphics:** `^GB` (box/line), `^GE` (ellipse), `^GC` (circle), `^GD` (diagonal line), `^GFA` (bitmap image, including compressed data)
- **Layout:** `^FO` (including justification parameter), `^FT`, `^LH`, `^PW`, `^LL`, `^BY`
- **Print settings:** `^PQ`, `^MM`, `^LS`
- **Modifiers:** `^LR` (label reverse), `^FR` (field reverse)

Unrecognised commands are skipped and listed in the import report.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Ctrl+D` | Duplicate selection |
| `Del` / `Backspace` | Delete selection |
| `G` | Toggle grid |
| `S` | Toggle snap |
| Middle mouse / Space+drag | Pan canvas |
| Scroll | Zoom |

### Saving and loading

Designs can be saved as `.json` (File → Save Design) and reopened later. This preserves all object properties exactly. The `.zpl` export is for sending to a printer and cannot be fully round-tripped back to an editable design.

---

![Screenshot: ZPL output panel and preview](_screenshots/zpl_output.png)
<!-- placeholder: replace with actual screenshot -->

---

## Features

- Drag, resize, and rotate objects on the canvas
- Multi-select with lasso or Shift-click
- Grid with configurable snap
- Undo / redo history
- Copy / paste
- Layers panel with reordering
- 32 UI languages (auto-detected from browser)
- Light / dark mode (follows OS setting)

---

## Limitations

- ZPL import covers the most common commands but not the full ZPL II command set. Labels using printer-stored images (`^IM`), downloaded graphics (`~DG`), or printer-specific extensions may not import completely. TrueType font references (`^A@`) are imported with best-effort sizing using the default font.
- Label preview requires a connection to `api.labelary.com`.
- Font rendering on the canvas is an approximation using Roboto Condensed, which is arguably the closest available web font to Zebra's proprietary bitmap fonts. Character widths will differ for some glyphs (e.g. `-` renders narrower than Zebra's equivalent). Use the Labelary preview for accurate output.
- No support for multi-label documents (`^XA...^XZ` repeated).

---

## Development

```bash
pnpm install
pnpm dev
```

Requires Node.js ≥ 18 and pnpm. Alternatively use `npm install` / `npm run dev`.

```bash
pnpm build   # output goes to dist/
```

The build output is entirely static and can be served from any web server or file host.

### Tech stack

- [React 19](https://react.dev/) + TypeScript
- [Vite](https://vite.dev/)
- [Konva](https://konvajs.org/) / react-konva: canvas rendering
- [Zustand](https://github.com/pmndrs/zustand) + [zundo](https://github.com/charkour/zundo): state and undo history
- [bwip-js](https://github.com/metafloor/bwip-js): barcode rendering
- [Tailwind CSS v4](https://tailwindcss.com/)

### How it works

The editor stores the label as a list of objects in Zustand. On every change, ZPL II is generated client-side by mapping each object to its corresponding ZPL commands. Barcodes are rendered on the canvas using bwip-js. Preview images are fetched from the Labelary API.

---

## Contributing

Issues and pull requests are welcome.

If you find a ZPL file that imports incorrectly, attaching the `.zpl` as an issue attachment is the most useful thing you can do.

---

## License

MIT
