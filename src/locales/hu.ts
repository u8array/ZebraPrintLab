const hu = {
  palette: {
    heading: 'Objektumok',
  },

  properties: {
    positionSection: 'Pozíció (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Címke',
    preset: 'Sablon',
    presetCustom: 'Egyéni',
    width: 'Szélesség (mm)',
    height: 'Magasság (mm)',
    dpmm: 'Felbontás',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Fájl',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Terv megnyitása',
    saveDesign: 'Terv mentése',
    print: 'Nyomtatás',
    propertiesTab: 'Tulajdonságok',
    layersTab: 'Rétegek',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Másolás',
    copied: '✓ Másolva',
    noObjects: '// Még nincsenek objektumok a címkén',
    previewHeading: 'Előnézet',
    loading: 'Betöltés…',
    unavailable: 'Nem elérhető',
    previewEmpty: 'Az előnézet megjelenik\nmódosítás után',
  },

  registry: {
    text: {
      content: 'Tartalom',
      fontHeight: 'Magasság (pont)',
      fontWidth: 'Szélesség (pont)',
      rotation: 'Forgatás',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Tartalom',
      height: 'Magasság (pont)',
      printInterpretation: 'Ember által olvasható',
      checkDigit: 'Ellenőrzőjegy',
    },
    box: {
      width: 'Szélesség (pont)',
      height: 'Magasság (pont)',
      thickness: 'Keret (pont)',
      filled: 'Kitöltött',
      color: 'Szín',
      colorB: 'B — Fekete',
      colorW: 'W — Fehér',
      rounding: 'Lekerekítés (0–8)',
    },
    code39: {
      content: 'Tartalom',
      height: 'Magasság (pont)',
      printInterpretation: 'Ember által olvasható',
      checkDigit: 'Ellenőrzőjegy',
    },
    qrcode: {
      content: 'Tartalom',
      magnification: 'Méret (1–10)',
      errorCorrection: 'Hibajavítás',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Tartalom (12 számjegy)',
      height: 'Magasság (pont)',
      printInterpretation: 'Ember által olvasható',
    },
    datamatrix: {
      content: 'Tartalom',
      dimension: 'Modulméret (1–12)',
      quality: 'Minőség',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Szélesség (pont)',
      height: 'Magasság (pont)',
      thickness: 'Keret (pont)',
      filled: 'Kitöltött',
      color: 'Szín',
      colorB: 'B — Fekete',
      colorW: 'W — Fehér',
    },
    line: {
      angle: 'Szög (°)',
      length: 'Hossz (pont)',
      thickness: 'Vastagság (pont)',
      color: 'Szín',
      colorB: 'B — Fekete',
      colorW: 'W — Fehér',
    },
  },

  layers: {
    propertiesTab: 'Tulajdonságok',
    layersTab: 'Rétegek',
    empty: 'Nincsenek objektumok a címkén',
    toFront: 'Előre hozás',
    forward: 'Egy réteggel előre',
    backward: 'Egy réteggel hátra',
    toBack: 'Hátra küldés',
  },
} as const;

export default hu;
