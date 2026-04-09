/**
 * UI strings — single source of truth.
 *
 * Migration path to i18next:
 *   1. pnpm add i18next react-i18next
 *   2. Init i18next with this object as the 'en' namespace
 *   3. Replace `import t from '../../locales/en'` → `const { t } = useTranslation()`
 *   4. Replace `t.some.key` → `t('some.key')`
 */
const en = {
  palette: {
    heading: 'Objects',
  },

  properties: {
    positionSection: 'Position (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Label',
    preset: 'Preset',
    presetCustom: 'Custom',
    width: 'Width (mm)',
    height: 'Height (mm)',
    dpmm: 'Resolution',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Copy',
    copied: '✓ Copied',
    noObjects: '// No objects on the label yet',
    previewHeading: 'Preview',
    loading: 'Loading…',
    unavailable: 'Unavailable',
    previewEmpty: 'Preview appears\nafter changes',
  },

  registry: {
    text: {
      content: 'Content',
      fontHeight: 'Height (dots)',
      fontWidth: 'Width (dots)',
      rotation: 'Rotation',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Content',
      height: 'Height (dots)',
      printInterpretation: 'Human readable',
      checkDigit: 'Check digit',
    },
    box: {
      width: 'Width (dots)',
      height: 'Height (dots)',
      thickness: 'Border (dots)',
      filled: 'Filled',
      color: 'Color',
      colorB: 'B — Black',
      colorW: 'W — White',
      rounding: 'Rounding (0–8)',
    },
    code39: {
      content: 'Content',
      height: 'Height (dots)',
      printInterpretation: 'Human readable',
      checkDigit: 'Check digit',
    },
    qrcode: {
      content: 'Content',
      magnification: 'Size (1–10)',
      errorCorrection: 'Error correction',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Content (12 digits)',
      height: 'Height (dots)',
      printInterpretation: 'Human readable',
    },
    datamatrix: {
      content: 'Content',
      dimension: 'Module size (1–12)',
      quality: 'Quality',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Width (dots)',
      height: 'Height (dots)',
      thickness: 'Border (dots)',
      filled: 'Filled',
      color: 'Color',
      colorB: 'B — Black',
      colorW: 'W — White',
    },
    line: {
      angle: 'Angle (°)',
      length: 'Length (dots)',
      thickness: 'Thickness (dots)',
      color: 'Color',
      colorB: 'B — Black',
      colorW: 'W — White',
    },
  },

  layers: {
    propertiesTab: 'Properties',
    layersTab: 'Layers',
    empty: 'No objects on the label',
    toFront: 'Bring to Front',
    forward: 'Bring Forward',
    backward: 'Send Backward',
    toBack: 'Send to Back',
  },
} as const;

export default en;
