# ZPL Label Designer

Visual label designer for Zebra printers. runs in the browser, no software to install.

Design your label on the canvas, then copy or export the ZPL output and send it to your printer. No knowledge of ZPL required.

**[Try it](https://u8array.github.io/zpl_label_designer/)** · [Report an issue](https://github.com/u8array/zpl_label_designer/issues)

> Early development. Core editing works, ZPL import is incomplete.

---

<!-- TODO: add screenshot -->

---

## Usage

### 1. Set up the label

The label dimensions and print resolution are shown in the header (`width × height mm · dpmm`). Click on them to adjust.

The print resolution (dpmm = dots per millimeter) must match your printer. Common values: 6 dpmm (152 dpi), 8 dpmm (203 dpi), 12 dpmm (300 dpi), 24 dpmm (600 dpi). Check your printer's manual if unsure — 8 dpmm is the most common.

### 2. Add objects

Drag items from the left panel onto the canvas, or click them to add at the center.

Available objects: text, serial (auto-incrementing number fields), barcodes (Code 128, Code 39, Code 93, I2of5, EAN-13, EAN-8, UPC-A, UPC-E, QR Code, DataMatrix, PDF417), shapes (box, line, ellipse), and images.

### 3. Edit properties

Select an object to configure it in the **Properties** panel on the right: content, size, font, barcode options, etc.

Multiple objects can be selected by holding Shift or drawing a lasso. Position and size changes apply to all selected objects.

### 4. Print or export

The **ZPL output** panel at the bottom shows the label as ZPL code — the language Zebra printers understand. It updates in real time as you edit.

- **Copy**: copies the ZPL to the clipboard — paste it into your printer software or send it directly to the printer
- **Preview**: fetches a rendered preview image from [Labelary](https://labelary.com/)
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
| Scroll | Pan canvas |
| Ctrl+Scroll | Zoom |

### Saving and loading

Designs can be saved as `.json` (File → Save Design) and reopened later. This preserves all object properties exactly. The `.zpl` export is for sending to a printer and cannot be fully round-tripped back to an editable design.

---

## Features

- Drag and resize objects on the canvas
- Multi-select with lasso or Shift-click
- Grid with configurable snap; smart alignment and spacing guides
- Undo / redo history
- Copy / paste
- Layers panel with reordering
- 32 UI languages (auto-detected from browser)
- Light / dark mode (follows OS setting)

---

## Limitations

- ZPL import covers the most common commands but not the full ZPL II command set. Labels using printer-stored images, downloaded graphics, or printer-specific extensions may not import completely.
- Font rendering on the canvas is an approximation. The preview on canvas may look slightly different from what the printer produces. Use the Labelary preview for accurate output.
- Label preview requires a connection to `api.labelary.com`.
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
