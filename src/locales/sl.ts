const sl = {
  palette: {
    heading: 'Predmeti',
  },

  properties: {
    positionSection: 'Položaj (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Nalepka',
    preset: 'Predloga',
    presetCustom: 'Po meri',
    width: 'Širina (mm)',
    height: 'Višina (mm)',
    dpmm: 'Ločljivost',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiraj',
    copied: '✓ Kopirano',
    noObjects: '// Na nalepki še ni predmetov',
    previewHeading: 'Predogled',
    loading: 'Nalaganje…',
    unavailable: 'Ni na voljo',
    previewEmpty: 'Predogled se prikaže\npo spremembah',
  },

  registry: {
    text: {
      content: 'Vsebina',
      fontHeight: 'Višina (točke)',
      fontWidth: 'Širina (točke)',
      rotation: 'Rotacija',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Vsebina',
      height: 'Višina (točke)',
      printInterpretation: 'Berljivo za človeka',
      checkDigit: 'Kontrolna številka',
    },
    box: {
      width: 'Širina (točke)',
      height: 'Višina (točke)',
      thickness: 'Okvir (točke)',
      filled: 'Zapolnjen',
      color: 'Barva',
      colorB: 'B — Črna',
      colorW: 'W — Bela',
      rounding: 'Zaobljenje (0–8)',
    },
    code39: {
      content: 'Vsebina',
      height: 'Višina (točke)',
      printInterpretation: 'Berljivo za človeka',
      checkDigit: 'Kontrolna številka',
    },
    qrcode: {
      content: 'Vsebina',
      magnification: 'Velikost (1–10)',
      errorCorrection: 'Popravljanje napak',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Vsebina (12 črkic)',
      height: 'Višina (točke)',
      printInterpretation: 'Berljivo za človeka',
    },
    datamatrix: {
      content: 'Vsebina',
      dimension: 'Velikost modula (1–12)',
      quality: 'Kakovost',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Širina (točke)',
      height: 'Višina (točke)',
      thickness: 'Okvir (točke)',
      filled: 'Zapolnjen',
      color: 'Barva',
      colorB: 'B — Črna',
      colorW: 'W — Bela',
    },
    line: {
      angle: 'Kot (°)',
      length: 'Dolžina (točke)',
      thickness: 'Debelina (točke)',
      color: 'Barva',
      colorB: 'B — Črna',
      colorW: 'W — Bela',
    },
  },

  layers: {
    propertiesTab: 'Lastnosti',
    layersTab: 'Plasti',
    empty: 'Na nalepki ni predmetov',
    toFront: 'Premakni v ospredje',
    forward: 'Premakni eno plast naprej',
    backward: 'Premakni eno plast nazaj',
    toBack: 'Premakni v ozadje',
  },
} as const;

export default sl;
