const sv = {
  palette: {
    heading: 'Objekt',
  },

  properties: {
    positionSection: 'Position (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etikett',
    preset: 'Mall',
    presetCustom: 'Anpassad',
    width: 'Bredd (mm)',
    height: 'Höjd (mm)',
    dpmm: 'Upplösning',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Fil',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Öppna design',
    saveDesign: 'Spara design',
    print: 'Skriv ut',
    propertiesTab: 'Egenskaper',
    layersTab: 'Lager',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiera',
    copied: '✓ Kopierat',
    noObjects: '// Inga objekt på etiketten ännu',
    previewHeading: 'Förhandsvisning',
    loading: 'Laddar…',
    unavailable: 'Ej tillgänglig',
    previewEmpty: 'Förhandsvisning visas\nefter ändringar',
  },

  registry: {
    text: {
      content: 'Innehåll',
      fontHeight: 'Höjd (punkter)',
      fontWidth: 'Bredd (punkter)',
      rotation: 'Rotation',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Innehåll',
      height: 'Höjd (punkter)',
      printInterpretation: 'Läsbar för människa',
      checkDigit: 'Kontrollsiffra',
    },
    box: {
      width: 'Bredd (punkter)',
      height: 'Höjd (punkter)',
      thickness: 'Kant (punkter)',
      filled: 'Fylld',
      color: 'Färg',
      colorB: 'B — Svart',
      colorW: 'W — Vit',
      rounding: 'Avrundning (0–8)',
    },
    code39: {
      content: 'Innehåll',
      height: 'Höjd (punkter)',
      printInterpretation: 'Läsbar för människa',
      checkDigit: 'Kontrollsiffra',
    },
    qrcode: {
      content: 'Innehåll',
      magnification: 'Storlek (1–10)',
      errorCorrection: 'Felkorrigering',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Innehåll (12 siffror)',
      height: 'Höjd (punkter)',
      printInterpretation: 'Läsbar för människa',
    },
    datamatrix: {
      content: 'Innehåll',
      dimension: 'Modulstorlek (1–12)',
      quality: 'Kvalitet',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Bredd (punkter)',
      height: 'Höjd (punkter)',
      thickness: 'Kant (punkter)',
      filled: 'Fylld',
      color: 'Färg',
      colorB: 'B — Svart',
      colorW: 'W — Vit',
    },
    line: {
      angle: 'Vinkel (°)',
      length: 'Längd (punkter)',
      thickness: 'Tjocklek (punkter)',
      color: 'Färg',
      colorB: 'B — Svart',
      colorW: 'W — Vit',
    },
  },

  layers: {
    propertiesTab: 'Egenskaper',
    layersTab: 'Lager',
    empty: 'Inga objekt på etiketten',
    toFront: 'Flytta längst fram',
    forward: 'Flytta ett lager framåt',
    backward: 'Flytta ett lager bakåt',
    toBack: 'Flytta längst bak',
  },
} as const;

export default sv;
