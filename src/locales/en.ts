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
      color: 'Color',
      colorB: 'B — Black',
      colorW: 'W — White',
      rounding: 'Rounding (0–8)',
    },
  },
} as const;

export default en;
