# ZebraPrintLab

[![Deploy](https://github.com/u8array/ZebraPrintLab/actions/workflows/deploy.yml/badge.svg)](https://github.com/u8array/ZebraPrintLab/actions/workflows/deploy.yml)

Browser-based label authoring tool for Zebra printers. No software to install.

Design labels visually and export the ZPL output to your printer. No knowledge of ZPL required.

**[Try it](https://u8array.github.io/ZebraPrintLab/)** · [Report an issue](https://github.com/u8array/ZebraPrintLab/issues)

> **Disclaimer:** This project is not affiliated with, endorsed by, or associated with Zebra Technologies Corp. ZPL (Zebra Programming Language) is a trademark of Zebra Technologies. This is an independent open-source tool.

---

<!-- TODO: add screenshot -->

---

## Usage

### 1. Set up the label

The label dimensions and print resolution are shown in the header (`width × height mm · dpmm`). Click on them to adjust.

The print resolution (dpmm = dots per millimeter) must match your printer. Common values: 6 dpmm (152 dpi), 8 dpmm (203 dpi), 12 dpmm (300 dpi), 24 dpmm (600 dpi). Check your printer's manual if unsure; 8 dpmm is the most common.

### 2. Add objects

Drag items from the left panel onto the canvas, or double-click them to add at the center.

Available objects: text, serial (auto-incrementing number fields), barcodes (Code 128, Code 39, Code 93, Code 11, Interleaved 2 of 5, Standard 2 of 5, Industrial 2 of 5, Codabar, LOGMARS, MSI, Plessey, GS1 Databar, Planet Code, Postal/POSTNET, EAN-13, EAN-8, UPC-A, UPC-E, QR Code, DataMatrix, PDF417, MicroPDF417, Aztec, Codablock F), shapes (box, line, ellipse), and images.

### 3. Edit properties

Select an object to configure it in the **Properties** panel on the right: content, size, font, barcode options, etc.

Multiple objects can be selected by holding Shift or drawing a lasso. Position and size changes apply to all selected objects.

### 4. Print or export

The **ZPL output** panel at the bottom shows the label as ZPL code (the language Zebra printers understand). It updates in real time as you edit.

- **Copy**: copies the ZPL to the clipboard; paste it into your printer software or send it directly to the printer
- **Preview**: fetches a rendered preview image from [Labelary](https://labelary.com/)
- **Export**: downloads a `.zpl` file (File menu)
- **Print**: opens the Labelary preview and triggers the browser print dialog

### Importing existing ZPL

File menu → **Import ZPL**: paste ZPL code directly, or open a `.zpl` file.

> **Round-trip semantics:** Import produces an editable reconstruction of the label, not an exact replica. ZPL encodes printer-side state (font tables, downloaded graphics, exact dot positioning) that has no direct equivalent in the visual model. Simple labels (especially those originally authored in this tool) import cleanly. Complex or machine-generated ZPL may import partially or lose fidelity. The import report lists any commands that were skipped or approximated.
>
> Use **Save design (.json)** to preserve a lossless, fully editable copy. `.zpl` is a printer output format, not a design source format.

The parser covers the most common ZPL II commands:

- **Text:** `^A0`, `^A*` (all bitmap fonts), `^A@` (TrueType, best-effort sizing), `^CF`, `^FW`, `^FB` (field block, including `\&` line breaks), `^TB`, `^FH` (hex escapes)
- **Barcodes:** Code 128, Code 39, Code 93, Code 11, Interleaved 2 of 5, Standard 2 of 5, Industrial 2 of 5, Codabar, LOGMARS, MSI, Plessey, GS1 Databar, Planet Code, Postal/POSTNET, EAN-13, EAN-8, UPC-A, UPC-E, QR Code, DataMatrix, PDF417, MicroPDF417, Aztec, Codablock F
- **Serialization:** `^SN`, `^SF` (imported as serial objects)
- **Graphics:** `^GB` (box/line), `^GE` (ellipse), `^GC` (circle), `^GD` (diagonal line), `^GFA` (bitmap image, including compressed data)
- **Layout:** `^FO` (including justification parameter), `^FT`, `^LH`, `^PW`, `^LL`, `^BY`
- **Print settings:** `^PQ`, `^MM`, `^LS`
- **Modifiers:** `^LR` (label reverse), `^FR` (field reverse)

Unrecognized commands are skipped and listed in the import report.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+A` | Select all |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Ctrl+D` | Duplicate selection |
| `Del` / `Backspace` | Delete selection |
| `G` | Toggle grid |
| `S` | Toggle snap |
| Middle mouse / Space+drag | Pan canvas |
| Scroll | Pan canvas |
| Ctrl+Scroll | Zoom |

### Saving and loading

`.json` (File → Save Design) is the canonical design format. It preserves all object properties exactly and can be reopened as a fully editable design. `.zpl` is a printer output format: use it to send to a printer, not as a design source.

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
- Font rendering on the canvas is an approximation of what the printer produces. Use the Labelary preview for accurate output.
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

If you find a ZPL file that imports incorrectly, attaching the `.zpl` file to the issue is the most useful thing you can do.

---

## License

MIT
