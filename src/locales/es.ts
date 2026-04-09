const es = {
  palette: {
    heading: 'Objetos',
  },

  properties: {
    positionSection: 'Posición (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Etiqueta',
    preset: 'Plantilla',
    presetCustom: 'Personalizado',
    width: 'Ancho (mm)',
    height: 'Alto (mm)',
    dpmm: 'Resolución',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Copiar',
    copied: '✓ Copiado',
    noObjects: '// Todavía no hay objetos en la etiqueta',
    previewHeading: 'Vista previa',
    loading: 'Cargando…',
    unavailable: 'No disponible',
    previewEmpty: 'La vista previa aparece\ntras los cambios',
  },

  registry: {
    text: {
      content: 'Contenido',
      fontHeight: 'Altura (puntos)',
      fontWidth: 'Ancho (puntos)',
      rotation: 'Rotación',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Contenido',
      height: 'Altura (puntos)',
      printInterpretation: 'Legible por humanos',
      checkDigit: 'Dígito de control',
    },
    box: {
      width: 'Ancho (puntos)',
      height: 'Alto (puntos)',
      thickness: 'Borde (puntos)',
      filled: 'Relleno',
      color: 'Color',
      colorB: 'B — Negro',
      colorW: 'W — Blanco',
      rounding: 'Redondeo (0–8)',
    },
    code39: {
      content: 'Contenido',
      height: 'Altura (puntos)',
      printInterpretation: 'Legible por humanos',
      checkDigit: 'Dígito de control',
    },
    qrcode: {
      content: 'Contenido',
      magnification: 'Tamaño (1–10)',
      errorCorrection: 'Corrección de errores',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Contenido (12 dígitos)',
      height: 'Altura (puntos)',
      printInterpretation: 'Legible por humanos',
    },
    datamatrix: {
      content: 'Contenido',
      dimension: 'Tamaño del módulo (1–12)',
      quality: 'Calidad',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Ancho (puntos)',
      height: 'Alto (puntos)',
      thickness: 'Borde (puntos)',
      filled: 'Relleno',
      color: 'Color',
      colorB: 'B — Negro',
      colorW: 'W — Blanco',
    },
    line: {
      angle: 'Ángulo (°)',
      length: 'Longitud (puntos)',
      thickness: 'Grosor (puntos)',
      color: 'Color',
      colorB: 'B — Negro',
      colorW: 'W — Blanco',
    },
  },

  layers: {
    propertiesTab: 'Propiedades',
    layersTab: 'Capas',
    empty: 'No hay objetos en la etiqueta',
    toFront: 'Traer al frente',
    forward: 'Avanzar una capa',
    backward: 'Retroceder una capa',
    toBack: 'Enviar al fondo',
  },
} as const;

export default es;
