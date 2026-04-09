const lv = {
  palette: {
    heading: 'Objekti',
  },

  properties: {
    positionSection: 'Pozīcija (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etiķete',
    preset: 'Veidne',
    presetCustom: 'Pielāgots',
    width: 'Platums (mm)',
    height: 'Augstums (mm)',
    dpmm: 'Izšķirtspēja',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Fails',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Atvērt dizainu',
    saveDesign: 'Saglabāt dizainu',
    print: 'Drukāt',
    propertiesTab: 'Īpašības',
    layersTab: 'Slāņi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopēt',
    copied: '✓ Nokopēts',
    noObjects: '// Etiķetē vēl nav objektu',
    previewHeading: 'Priekšskatījums',
    loading: 'Ielādē…',
    unavailable: 'Nav pieejams',
    previewEmpty: 'Priekšskatījums parādās\npēc izmaiņām',
  },

  registry: {
    text: {
      content: 'Saturs',
      fontHeight: 'Augstums (punkti)',
      fontWidth: 'Platums (punkti)',
      rotation: 'Rotācija',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Saturs',
      height: 'Augstums (punkti)',
      printInterpretation: 'Cilvēkam lasāms',
      checkDigit: 'Pārbaudes cipars',
    },
    box: {
      width: 'Platums (punkti)',
      height: 'Augstums (punkti)',
      thickness: 'Apmale (punkti)',
      filled: 'Aizpildīts',
      color: 'Krāsa',
      colorB: 'B — Melna',
      colorW: 'W — Balta',
      rounding: 'Noapaļojums (0–8)',
    },
    code39: {
      content: 'Saturs',
      height: 'Augstums (punkti)',
      printInterpretation: 'Cilvēkam lasāms',
      checkDigit: 'Pārbaudes cipars',
    },
    qrcode: {
      content: 'Saturs',
      magnification: 'Izmērs (1–10)',
      errorCorrection: 'Kļūdu labošana',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Saturs (12 cipari)',
      height: 'Augstums (punkti)',
      printInterpretation: 'Cilvēkam lasāms',
    },
    datamatrix: {
      content: 'Saturs',
      dimension: 'Moduļa izmērs (1–12)',
      quality: 'Kvalitāte',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Platums (punkti)',
      height: 'Augstums (punkti)',
      thickness: 'Apmale (punkti)',
      filled: 'Aizpildīts',
      color: 'Krāsa',
      colorB: 'B — Melna',
      colorW: 'W — Balta',
    },
    line: {
      angle: 'Leņķis (°)',
      length: 'Garums (punkti)',
      thickness: 'Biezums (punkti)',
      color: 'Krāsa',
      colorB: 'B — Melna',
      colorW: 'W — Balta',
    },
  },

  layers: {
    propertiesTab: 'Rekvizīti',
    layersTab: 'Slāņi',
    empty: 'Etiķetē nav objektu',
    toFront: 'Pārvietot uz priekšu',
    forward: 'Pārvietot vienu slāni uz priekšu',
    backward: 'Pārvietot vienu slāni atpakaļ',
    toBack: 'Pārvietot uz aizmuguri',
  },
} as const;

export default lv;
