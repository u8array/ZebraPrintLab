const hr = {
  palette: {
    heading: 'Objekti',
  },

  properties: {
    positionSection: 'Položaj (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Naljepnica',
    preset: 'Predložak',
    presetCustom: 'Prilagođen',
    width: 'Širina (mm)',
    height: 'Visina (mm)',
    dpmm: 'Razlučivost',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Datoteka',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Otvori dizajn',
    saveDesign: 'Spremi dizajn',
    print: 'Ispis',
    propertiesTab: 'Svojstva',
    layersTab: 'Slojevi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiraj',
    copied: '✓ Kopirano',
    noObjects: '// Nema objekata na naljepnici',
    previewHeading: 'Pregled',
    loading: 'Učitavanje…',
    unavailable: 'Nedostupno',
    previewEmpty: 'Pregled se prikazuje\nnakon promjena',
  },

  registry: {
    text: {
      content: 'Sadržaj',
      fontHeight: 'Visina (točke)',
      fontWidth: 'Širina (točke)',
      rotation: 'Rotacija',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Sadržaj',
      height: 'Visina (točke)',
      printInterpretation: 'Čitljivo za čovjeka',
      checkDigit: 'Kontrolna znamenka',
    },
    box: {
      width: 'Širina (točke)',
      height: 'Visina (točke)',
      thickness: 'Okvir (točke)',
      filled: 'Ispunjen',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bijela',
      rounding: 'Zaobljenje (0–8)',
    },
    code39: {
      content: 'Sadržaj',
      height: 'Visina (točke)',
      printInterpretation: 'Čitljivo za čovjeka',
      checkDigit: 'Kontrolna znamenka',
    },
    qrcode: {
      content: 'Sadržaj',
      magnification: 'Veličina (1–10)',
      errorCorrection: 'Ispravak pogrešaka',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Sadržaj (12 znamenki)',
      height: 'Visina (točke)',
      printInterpretation: 'Čitljivo za čovjeka',
    },
    datamatrix: {
      content: 'Sadržaj',
      dimension: 'Veličina modula (1–12)',
      quality: 'Kvaliteta',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Širina (točke)',
      height: 'Visina (točke)',
      thickness: 'Okvir (točke)',
      filled: 'Ispunjen',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bijela',
    },
    line: {
      angle: 'Kut (°)',
      length: 'Duljina (točke)',
      thickness: 'Debljina (točke)',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bijela',
    },
  },

  layers: {
    propertiesTab: 'Svojstva',
    layersTab: 'Slojevi',
    empty: 'Nema objekata na naljepnici',
    toFront: 'Pomakni naprijed',
    forward: 'Jedan sloj naprijed',
    backward: 'Jedan sloj nazad',
    toBack: 'Pomakni nazad',
  },
} as const;

export default hr;
