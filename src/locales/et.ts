const et = {
  palette: {
    heading: 'Objektid',
  },

  properties: {
    positionSection: 'Asukoht (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Silt',
    preset: 'Mall',
    presetCustom: 'Kohandatud',
    width: 'Laius (mm)',
    height: 'Kõrgus (mm)',
    dpmm: 'Eraldusvõime',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Fail',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Ava kujundus',
    saveDesign: 'Salvesta kujundus',
    print: 'Prindi',
    propertiesTab: 'Omadused',
    layersTab: 'Kihid',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopeeri',
    copied: '✓ Kopeeritud',
    noObjects: '// Sildil pole veel objekte',
    previewHeading: 'Eelvaade',
    loading: 'Laadimine…',
    unavailable: 'Pole saadaval',
    previewEmpty: 'Eelvaade kuvatakse\npärast muudatusi',
  },

  registry: {
    text: {
      content: 'Sisu',
      fontHeight: 'Kõrgus (punkti)',
      fontWidth: 'Laius (punkti)',
      rotation: 'Pööramine',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Sisu',
      height: 'Kõrgus (punkti)',
      printInterpretation: 'Inimesele loetav',
      checkDigit: 'Kontrollnumber',
    },
    box: {
      width: 'Laius (punkti)',
      height: 'Kõrgus (punkti)',
      thickness: 'Ääris (punkti)',
      filled: 'Täidetud',
      color: 'Värvus',
      colorB: 'B — Must',
      colorW: 'W — Valge',
      rounding: 'Ümardus (0–8)',
    },
    code39: {
      content: 'Sisu',
      height: 'Kõrgus (punkti)',
      printInterpretation: 'Inimesele loetav',
      checkDigit: 'Kontrollnumber',
    },
    qrcode: {
      content: 'Sisu',
      magnification: 'Suurus (1–10)',
      errorCorrection: 'Veaparandus',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Sisu (12 numbrit)',
      height: 'Kõrgus (punkti)',
      printInterpretation: 'Inimesele loetav',
    },
    datamatrix: {
      content: 'Sisu',
      dimension: 'Mooduli suurus (1–12)',
      quality: 'Kvaliteet',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Laius (punkti)',
      height: 'Kõrgus (punkti)',
      thickness: 'Ääris (punkti)',
      filled: 'Täidetud',
      color: 'Värvus',
      colorB: 'B — Must',
      colorW: 'W — Valge',
    },
    line: {
      angle: 'Nurk (°)',
      length: 'Pikkus (punkti)',
      thickness: 'Paksus (punkti)',
      color: 'Värvus',
      colorB: 'B — Must',
      colorW: 'W — Valge',
    },
  },

  layers: {
    propertiesTab: 'Omadused',
    layersTab: 'Kihid',
    empty: 'Sildil pole objekte',
    toFront: 'Too ette',
    forward: 'Liiguta üks kiht ette',
    backward: 'Liiguta üks kiht taha',
    toBack: 'Saada taha',
  },
} as const;

export default et;
