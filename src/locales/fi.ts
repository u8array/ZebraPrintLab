const fi = {
  palette: {
    heading: 'Objektit',
  },

  properties: {
    positionSection: 'Sijainti (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etiketti',
    preset: 'Malli',
    presetCustom: 'Mukautettu',
    width: 'Leveys (mm)',
    height: 'Korkeus (mm)',
    dpmm: 'Tarkkuus',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopioi',
    copied: '✓ Kopioitu',
    noObjects: '// Etiketillä ei ole vielä objekteja',
    previewHeading: 'Esikatselu',
    loading: 'Ladataan…',
    unavailable: 'Ei saatavilla',
    previewEmpty: 'Esikatselu näkyy\nmuutosten jälkeen',
  },

  registry: {
    text: {
      content: 'Sisältö',
      fontHeight: 'Korkeus (pistettä)',
      fontWidth: 'Leveys (pistettä)',
      rotation: 'Kierto',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Sisältö',
      height: 'Korkeus (pistettä)',
      printInterpretation: 'Ihmisluettava',
      checkDigit: 'Tarkistusnumero',
    },
    box: {
      width: 'Leveys (pistettä)',
      height: 'Korkeus (pistettä)',
      thickness: 'Reunus (pistettä)',
      filled: 'Täytetty',
      color: 'Väri',
      colorB: 'B — Musta',
      colorW: 'W — Valkoinen',
      rounding: 'Pyöristys (0–8)',
    },
    code39: {
      content: 'Sisältö',
      height: 'Korkeus (pistettä)',
      printInterpretation: 'Ihmisluettava',
      checkDigit: 'Tarkistusnumero',
    },
    qrcode: {
      content: 'Sisältö',
      magnification: 'Koko (1–10)',
      errorCorrection: 'Virheen korjaus',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Sisältö (12 numeroa)',
      height: 'Korkeus (pistettä)',
      printInterpretation: 'Ihmisluettava',
    },
    datamatrix: {
      content: 'Sisältö',
      dimension: 'Modulin koko (1–12)',
      quality: 'Laatu',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Leveys (pistettä)',
      height: 'Korkeus (pistettä)',
      thickness: 'Reunus (pistettä)',
      filled: 'Täytetty',
      color: 'Väri',
      colorB: 'B — Musta',
      colorW: 'W — Valkoinen',
    },
    line: {
      angle: 'Kulma (°)',
      length: 'Pituus (pistettä)',
      thickness: 'Paksuus (pistettä)',
      color: 'Väri',
      colorB: 'B — Musta',
      colorW: 'W — Valkoinen',
    },
  },

  layers: {
    propertiesTab: 'Ominaisuudet',
    layersTab: 'Tasot',
    empty: 'Etiketillä ei ole objekteja',
    toFront: 'Tuo eteen',
    forward: 'Siirrä taso eteenpäin',
    backward: 'Siirrä taso taaksepäin',
    toBack: 'Lähetä taustalle',
  },
} as const;

export default fi;
