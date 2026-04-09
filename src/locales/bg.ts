const bg = {
  palette: {
    heading: 'Обекти',
  },

  properties: {
    positionSection: 'Позиция (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Етикет',
    preset: 'Шаблон',
    presetCustom: 'Персонализиран',
    width: 'Ширина (mm)',
    height: 'Височина (mm)',
    dpmm: 'Резолюция',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Копирай',
    copied: '✓ Копирано',
    noObjects: '// Все още няма обекти върху етикета',
    previewHeading: 'Преглед',
    loading: 'Зарежда…',
    unavailable: 'Недостъпно',
    previewEmpty: 'Преглед се появява\nслед промени',
  },

  registry: {
    text: {
      content: 'Съдържание',
      fontHeight: 'Височина (точки)',
      fontWidth: 'Ширина (точки)',
      rotation: 'Завъртане',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Съдържание',
      height: 'Височина (точки)',
      printInterpretation: 'Четливо от хора',
      checkDigit: 'Контролна цифра',
    },
    box: {
      width: 'Ширина (точки)',
      height: 'Височина (точки)',
      thickness: 'Рамка (точки)',
      filled: 'Запълнен',
      color: 'Цвят',
      colorB: 'B — Черен',
      colorW: 'W — Бял',
      rounding: 'Закръгляне (0–8)',
    },
    code39: {
      content: 'Съдържание',
      height: 'Височина (точки)',
      printInterpretation: 'Четливо от хора',
      checkDigit: 'Контролна цифра',
    },
    qrcode: {
      content: 'Съдържание',
      magnification: 'Размер (1–10)',
      errorCorrection: 'Корекция на грешки',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Съдържание (12 цифри)',
      height: 'Височина (точки)',
      printInterpretation: 'Четливо от хора',
    },
    datamatrix: {
      content: 'Съдържание',
      dimension: 'Размер на модула (1–12)',
      quality: 'Качество',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Ширина (точки)',
      height: 'Височина (точки)',
      thickness: 'Рамка (точки)',
      filled: 'Запълнен',
      color: 'Цвят',
      colorB: 'B — Черен',
      colorW: 'W — Бял',
    },
    line: {
      angle: 'Ъгъл (°)',
      length: 'Дължина (точки)',
      thickness: 'Дебелина (точки)',
      color: 'Цвят',
      colorB: 'B — Черен',
      colorW: 'W — Бял',
    },
  },

  layers: {
    propertiesTab: 'Свойства',
    layersTab: 'Слоеве',
    empty: 'Няма обекти върху етикета',
    toFront: 'Премести най-напред',
    forward: 'Премести напред',
    backward: 'Премести назад',
    toBack: 'Премести най-назад',
  },
} as const;

export default bg;
