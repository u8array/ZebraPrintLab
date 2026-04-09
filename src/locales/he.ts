const he = {
  palette: {
    heading: 'אובייקטים',
  },

  properties: {
    positionSection: 'מיקום (מ"מ)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'תווית',
    preset: 'הגדרה מוגדרת מראש',
    presetCustom: 'מותאם אישית',
    width: 'רוחב (מ"מ)',
    height: 'גובה (מ"מ)',
    dpmm: 'רזולוציה',
    dpmm6: '6 נקודות/מ"מ — 152 dpi',
    dpmm8: '8 נקודות/מ"מ — 203 dpi',
    dpmm12: '12 נקודות/מ"מ — 300 dpi',
    dpmm24: '24 נקודות/מ"מ — 600 dpi',
  },

  app: {
    file: 'קובץ',
    importZpl: 'ייבוא ZPL',
    exportZpl: 'ייצוא ZPL',
    openDesign: 'פתח עיצוב',
    saveDesign: 'שמור עיצוב',
    print: 'הדפסה',
    propertiesTab: 'מאפיינים',
    layersTab: 'שכבות',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'העתק',
    copied: '✓ הועתק',
    noObjects: '// אין אובייקטים על התווית עדיין',
    previewHeading: 'תצוגה מקדימה',
    loading: 'טוען…',
    unavailable: 'לא זמין',
    previewEmpty: 'התצוגה המקדימה מופיעה\nלאחר שינויים',
  },

  registry: {
    text: {
      content: 'תוכן',
      fontHeight: 'גובה (נקודות)',
      fontWidth: 'רוחב (נקודות)',
      rotation: 'סיבוב',
      rotationN: 'N — רגיל',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'תוכן',
      height: 'גובה (נקודות)',
      printInterpretation: 'קריא לאדם',
      checkDigit: 'ספרת ביקורת',
    },
    box: {
      width: 'רוחב (נקודות)',
      height: 'גובה (נקודות)',
      thickness: 'גבול (נקודות)',
      filled: 'מלא',
      color: 'צבע',
      colorB: 'B — שחור',
      colorW: 'W — לבן',
      rounding: 'עיגול (0–8)',
    },
    code39: {
      content: 'תוכן',
      height: 'גובה (נקודות)',
      printInterpretation: 'קריא לאדם',
      checkDigit: 'ספרת ביקורת',
    },
    qrcode: {
      content: 'תוכן',
      magnification: 'גודל (1–10)',
      errorCorrection: 'תיקון שגיאות',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'תוכן (12 ספרות)',
      height: 'גובה (נקודות)',
      printInterpretation: 'קריא לאדם',
    },
    datamatrix: {
      content: 'תוכן',
      dimension: 'גודל מודול (1–12)',
      quality: 'איכות',
      qualityAuto: '0 — אוטומטי',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'רוחב (נקודות)',
      height: 'גובה (נקודות)',
      thickness: 'גבול (נקודות)',
      filled: 'מלא',
      color: 'צבע',
      colorB: 'B — שחור',
      colorW: 'W — לבן',
    },
    line: {
      angle: 'זווית (°)',
      length: 'אורך (נקודות)',
      thickness: 'עובי (נקודות)',
      color: 'צבע',
      colorB: 'B — שחור',
      colorW: 'W — לבן',
    },
  },

  layers: {
    propertiesTab: 'מאפיינים',
    layersTab: 'שכבות',
    empty: 'אין אובייקטים על התווית',
    toFront: 'הבא לקדמה',
    forward: 'הבא קדימה',
    backward: 'שלח אחורה',
    toBack: 'שלח לאחור',
  },
} as const;

export default he;
