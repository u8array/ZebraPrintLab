const da = {
  palette: {
    heading: 'Objekter',
  },

  properties: {
    positionSection: 'Position (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etiket',
    preset: 'Skabelon',
    presetCustom: 'Tilpasset',
    width: 'Bredde (mm)',
    height: 'Højde (mm)',
    dpmm: 'Opløsning',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Fil',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Åbn design',
    saveDesign: 'Gem design',
    print: 'Udskriv',
    propertiesTab: 'Egenskaber',
    layersTab: 'Lag',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiér',
    copied: '✓ Kopieret',
    noObjects: '// Ingen objekter på etiketten endnu',
    previewHeading: 'Forhåndsvisning',
    loading: 'Indlæser…',
    unavailable: 'Ikke tilgængelig',
    previewEmpty: 'Forhåndsvisning vises\nefter ændringer',
  },

  registry: {
    text: {
      content: 'Indhold',
      fontHeight: 'Højde (punkter)',
      fontWidth: 'Bredde (punkter)',
      rotation: 'Rotation',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Indhold',
      height: 'Højde (punkter)',
      printInterpretation: 'Læsbar for mennesker',
      checkDigit: 'Kontrolciffer',
    },
    box: {
      width: 'Bredde (punkter)',
      height: 'Højde (punkter)',
      thickness: 'Kant (punkter)',
      filled: 'Udfyldt',
      color: 'Farve',
      colorB: 'B — Sort',
      colorW: 'W — Hvid',
      rounding: 'Afrunding (0–8)',
    },
    code39: {
      content: 'Indhold',
      height: 'Højde (punkter)',
      printInterpretation: 'Læsbar for mennesker',
      checkDigit: 'Kontrolciffer',
    },
    qrcode: {
      content: 'Indhold',
      magnification: 'Størrelse (1–10)',
      errorCorrection: 'Fejlrettelse',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Indhold (12 cifre)',
      height: 'Højde (punkter)',
      printInterpretation: 'Læsbar for mennesker',
    },
    datamatrix: {
      content: 'Indhold',
      dimension: 'Modulstørrelse (1–12)',
      quality: 'Kvalitet',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Bredde (punkter)',
      height: 'Højde (punkter)',
      thickness: 'Kant (punkter)',
      filled: 'Udfyldt',
      color: 'Farve',
      colorB: 'B — Sort',
      colorW: 'W — Hvid',
    },
    line: {
      angle: 'Vinkel (°)',
      length: 'Længde (punkter)',
      thickness: 'Tykkelse (punkter)',
      color: 'Farve',
      colorB: 'B — Sort',
      colorW: 'W — Hvid',
    },
  },

  layers: {
    propertiesTab: 'Egenskaber',
    layersTab: 'Lag',
    empty: 'Ingen objekter på etiketten',
    toFront: 'Bring til forgrunden',
    forward: 'Flyt et lag frem',
    backward: 'Flyt et lag tilbage',
    toBack: 'Send til baggrunden',
  },
} as const;

export default da;
