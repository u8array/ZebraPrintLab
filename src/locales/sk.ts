const sk = {
  palette: {
    heading: 'Objekty',
  },

  properties: {
    positionSection: 'Pozícia (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Štítok',
    preset: 'Šablóna',
    presetCustom: 'Vlastný',
    width: 'Šírka (mm)',
    height: 'Výška (mm)',
    dpmm: 'Rozlíšenie',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopírovať',
    copied: '✓ Skopírované',
    noObjects: '// Na štítku zatiaľ nie sú žiadne objekty',
    previewHeading: 'Náhľad',
    loading: 'Načítavanie…',
    unavailable: 'Nedostupné',
    previewEmpty: 'Náhľad sa zobrazí\npo úpravách',
  },

  registry: {
    text: {
      content: 'Obsah',
      fontHeight: 'Výška (body)',
      fontWidth: 'Šírka (body)',
      rotation: 'Otočenie',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Obsah',
      height: 'Výška (body)',
      printInterpretation: 'Čitateľný pre človeka',
      checkDigit: 'Kontrolná číslica',
    },
    box: {
      width: 'Šírka (body)',
      height: 'Výška (body)',
      thickness: 'Rámček (body)',
      filled: 'Vyplnený',
      color: 'Farba',
      colorB: 'B — Čierna',
      colorW: 'W — Biela',
      rounding: 'Zaoblenie (0–8)',
    },
    code39: {
      content: 'Obsah',
      height: 'Výška (body)',
      printInterpretation: 'Čitateľný pre človeka',
      checkDigit: 'Kontrolná číslica',
    },
    qrcode: {
      content: 'Obsah',
      magnification: 'Veľkosť (1–10)',
      errorCorrection: 'Oprava chýb',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Obsah (12 číslic)',
      height: 'Výška (body)',
      printInterpretation: 'Čitateľný pre človeka',
    },
    datamatrix: {
      content: 'Obsah',
      dimension: 'Veľkosť modulu (1–12)',
      quality: 'Kvalita',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Šírka (body)',
      height: 'Výška (body)',
      thickness: 'Rámček (body)',
      filled: 'Vyplnený',
      color: 'Farba',
      colorB: 'B — Čierna',
      colorW: 'W — Biela',
    },
    line: {
      angle: 'Uhol (°)',
      length: 'Dĺžka (body)',
      thickness: 'Hrúbka (body)',
      color: 'Farba',
      colorB: 'B — Čierna',
      colorW: 'W — Biela',
    },
  },

  layers: {
    propertiesTab: 'Vlastnosti',
    layersTab: 'Vrstvy',
    empty: 'Na štítku nie sú žiadne objekty',
    toFront: 'Preniesť do popredia',
    forward: 'Posunúť dopredu',
    backward: 'Posunúť dozadu',
    toBack: 'Odoslať do pozadia',
  },
} as const;

export default sk;
