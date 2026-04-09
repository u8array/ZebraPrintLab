const nl = {
  palette: {
    heading: 'Objecten',
  },

  properties: {
    positionSection: 'Positie (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etiket',
    preset: 'Voorinstelling',
    presetCustom: 'Aangepast',
    width: 'Breedte (mm)',
    height: 'Hoogte (mm)',
    dpmm: 'Resolutie',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiëren',
    copied: '✓ Gekopieerd',
    noObjects: '// Nog geen objecten op het etiket',
    previewHeading: 'Voorbeeld',
    loading: 'Laden…',
    unavailable: 'Niet beschikbaar',
    previewEmpty: 'Voorbeeld verschijnt\nna wijzigingen',
  },

  registry: {
    text: {
      content: 'Inhoud',
      fontHeight: 'Hoogte (punten)',
      fontWidth: 'Breedte (punten)',
      rotation: 'Rotatie',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Inhoud',
      height: 'Hoogte (punten)',
      printInterpretation: 'Leesbaar voor mensen',
      checkDigit: 'Controlegetal',
    },
    box: {
      width: 'Breedte (punten)',
      height: 'Hoogte (punten)',
      thickness: 'Rand (punten)',
      filled: 'Gevuld',
      color: 'Kleur',
      colorB: 'B — Zwart',
      colorW: 'W — Wit',
      rounding: 'Afronding (0–8)',
    },
    code39: {
      content: 'Inhoud',
      height: 'Hoogte (punten)',
      printInterpretation: 'Leesbaar voor mensen',
      checkDigit: 'Controlegetal',
    },
    qrcode: {
      content: 'Inhoud',
      magnification: 'Grootte (1–10)',
      errorCorrection: 'Foutcorrectie',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Inhoud (12 cijfers)',
      height: 'Hoogte (punten)',
      printInterpretation: 'Leesbaar voor mensen',
    },
    datamatrix: {
      content: 'Inhoud',
      dimension: 'Modulegrootte (1–12)',
      quality: 'Kwaliteit',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Breedte (punten)',
      height: 'Hoogte (punten)',
      thickness: 'Rand (punten)',
      filled: 'Gevuld',
      color: 'Kleur',
      colorB: 'B — Zwart',
      colorW: 'W — Wit',
    },
    line: {
      angle: 'Hoek (°)',
      length: 'Lengte (punten)',
      thickness: 'Dikte (punten)',
      color: 'Kleur',
      colorB: 'B — Zwart',
      colorW: 'W — Wit',
    },
  },

  layers: {
    propertiesTab: 'Eigenschappen',
    layersTab: 'Lagen',
    empty: 'Geen objecten op het etiket',
    toFront: 'Naar de voorgrond',
    forward: 'Één laag naar voren',
    backward: 'Één laag naar achteren',
    toBack: 'Naar de achtergrond',
  },
} as const;

export default nl;
