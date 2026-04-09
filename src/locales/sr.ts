const sr = {
  palette: {
    heading: 'Objekti',
  },

  properties: {
    positionSection: 'Položaj (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Nalepnica',
    preset: 'Predložak',
    presetCustom: 'Prilagođen',
    width: 'Širina (mm)',
    height: 'Visina (mm)',
    dpmm: 'Rezolucija',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiraj',
    copied: '✓ Kopirano',
    noObjects: '// Nema objekata na nalepnici',
    previewHeading: 'Pregled',
    loading: 'Učitavanje…',
    unavailable: 'Nedostupno',
    previewEmpty: 'Pregled se prikazuje\nnakon promena',
  },

  registry: {
    text: {
      content: 'Sadržaj',
      fontHeight: 'Visina (tačke)',
      fontWidth: 'Širina (tačke)',
      rotation: 'Rotacija',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Sadržaj',
      height: 'Visina (tačke)',
      printInterpretation: 'Čitljivo za čoveka',
      checkDigit: 'Kontrolna cifra',
    },
    box: {
      width: 'Širina (tačke)',
      height: 'Visina (tačke)',
      thickness: 'Okvir (tačke)',
      filled: 'Popunjen',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bela',
      rounding: 'Zaobljenje (0–8)',
    },
    code39: {
      content: 'Sadržaj',
      height: 'Visina (tačke)',
      printInterpretation: 'Čitljivo za čoveka',
      checkDigit: 'Kontrolna cifra',
    },
    qrcode: {
      content: 'Sadržaj',
      magnification: 'Veličina (1–10)',
      errorCorrection: 'Ispravka grešaka',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Sadržaj (12 cifara)',
      height: 'Visina (tačke)',
      printInterpretation: 'Čitljivo za čoveka',
    },
    datamatrix: {
      content: 'Sadržaj',
      dimension: 'Veličina modula (1–12)',
      quality: 'Kvalitet',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Širina (tačke)',
      height: 'Visina (tačke)',
      thickness: 'Okvir (tačke)',
      filled: 'Popunjen',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bela',
    },
    line: {
      angle: 'Ugao (°)',
      length: 'Dužina (tačke)',
      thickness: 'Debljina (tačke)',
      color: 'Boja',
      colorB: 'B — Crna',
      colorW: 'W — Bela',
    },
  },

  layers: {
    propertiesTab: 'Svojstva',
    layersTab: 'Slojevi',
    empty: 'Nema objekata na nalepnici',
    toFront: 'Pomeri napred',
    forward: 'Jedan sloj napred',
    backward: 'Jedan sloj nazad',
    toBack: 'Pomeri nazad',
  },
} as const;

export default sr;
