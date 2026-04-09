const pl = {
  palette: {
    heading: 'Obiekty',
  },

  properties: {
    positionSection: 'Pozycja (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etykieta',
    preset: 'Szablon',
    presetCustom: 'Niestandardowy',
    width: 'Szerokość (mm)',
    height: 'Wysokość (mm)',
    dpmm: 'Rozdzielczość',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Kopiuj',
    copied: '✓ Skopiowano',
    noObjects: '// Brak obiektów na etykiecie',
    previewHeading: 'Podgląd',
    loading: 'Ładowanie…',
    unavailable: 'Niedostępny',
    previewEmpty: 'Podgląd pojawi się\npo zmianach',
  },

  registry: {
    text: {
      content: 'Zawartość',
      fontHeight: 'Wysokość (punkty)',
      fontWidth: 'Szerokość (punkty)',
      rotation: 'Obrót',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Zawartość',
      height: 'Wysokość (punkty)',
      printInterpretation: 'Czytelny dla człowieka',
      checkDigit: 'Cyfra kontrolna',
    },
    box: {
      width: 'Szerokość (punkty)',
      height: 'Wysokość (punkty)',
      thickness: 'Kontur (punkty)',
      filled: 'Wypełniony',
      color: 'Kolor',
      colorB: 'B — Czarny',
      colorW: 'W — Biały',
      rounding: 'Zaokrąglenie (0–8)',
    },
    code39: {
      content: 'Zawartość',
      height: 'Wysokość (punkty)',
      printInterpretation: 'Czytelny dla człowieka',
      checkDigit: 'Cyfra kontrolna',
    },
    qrcode: {
      content: 'Zawartość',
      magnification: 'Rozmiar (1–10)',
      errorCorrection: 'Korekcja błędów',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Zawartość (12 cyfr)',
      height: 'Wysokość (punkty)',
      printInterpretation: 'Czytelny dla człowieka',
    },
    datamatrix: {
      content: 'Zawartość',
      dimension: 'Rozmiar modułu (1–12)',
      quality: 'Jakość',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Szerokość (punkty)',
      height: 'Wysokość (punkty)',
      thickness: 'Kontur (punkty)',
      filled: 'Wypełniony',
      color: 'Kolor',
      colorB: 'B — Czarny',
      colorW: 'W — Biały',
    },
    line: {
      angle: 'Kąt (°)',
      length: 'Długość (punkty)',
      thickness: 'Grubość (punkty)',
      color: 'Kolor',
      colorB: 'B — Czarny',
      colorW: 'W — Biały',
    },
  },

  layers: {
    propertiesTab: 'Właściwości',
    layersTab: 'Warstwy',
    empty: 'Brak obiektów na etykiecie',
    toFront: 'Przesuń na wierzch',
    forward: 'Przesuń do przodu',
    backward: 'Przesuń do tyłu',
    toBack: 'Przesuń na spód',
  },
} as const;

export default pl;
