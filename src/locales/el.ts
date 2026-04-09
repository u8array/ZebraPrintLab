const el = {
  palette: {
    heading: 'Αντικείμενα',
  },

  properties: {
    positionSection: 'Θέση (mm)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: 'Ετικέτα',
    preset: 'Πρότυπο',
    presetCustom: 'Προσαρμοσμένο',
    width: 'Πλάτος (mm)',
    height: 'Ύψος (mm)',
    dpmm: 'Ανάλυση',
    dpmm6: '6 dpmm — 152 dpi',
    dpmm8: '8 dpmm — 203 dpi',
    dpmm12: '12 dpmm — 300 dpi',
    dpmm24: '24 dpmm — 600 dpi',
  },

  app: {
    file: 'Αρχείο',
    importZpl: 'Import ZPL',
    exportZpl: 'Export ZPL',
    openDesign: 'Άνοιγμα σχεδίου',
    saveDesign: 'Αποθήκευση σχεδίου',
    print: 'Εκτύπωση',
    propertiesTab: 'Ιδιότητες',
    layersTab: 'Επίπεδα',
  },

  output: {
    zplHeading: 'ZPL',
    copy: 'Αντιγραφή',
    copied: '✓ Αντιγράφηκε',
    noObjects: '// Δεν υπάρχουν ακόμη αντικείμενα στην ετικέτα',
    previewHeading: 'Προεπισκόπηση',
    loading: 'Φόρτωση…',
    unavailable: 'Μη διαθέσιμο',
    previewEmpty: 'Η προεπισκόπηση εμφανίζεται\nμετά τις αλλαγές',
  },

  registry: {
    text: {
      content: 'Περιεχόμενο',
      fontHeight: 'Ύψος (κουκκίδες)',
      fontWidth: 'Πλάτος (κουκκίδες)',
      rotation: 'Περιστροφή',
      rotationN: 'N — Normal',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: 'Περιεχόμενο',
      height: 'Ύψος (κουκκίδες)',
      printInterpretation: 'Αναγνώσιμο από άνθρωπο',
      checkDigit: 'Ψηφίο ελέγχου',
    },
    box: {
      width: 'Πλάτος (κουκκίδες)',
      height: 'Ύψος (κουκκίδες)',
      thickness: 'Πλαίσιο (κουκκίδες)',
      filled: 'Γεμισμένο',
      color: 'Χρώμα',
      colorB: 'B — Μαύρο',
      colorW: 'W — Λευκό',
      rounding: 'Στρογγυλοποίηση (0–8)',
    },
    code39: {
      content: 'Περιεχόμενο',
      height: 'Ύψος (κουκκίδες)',
      printInterpretation: 'Αναγνώσιμο από άνθρωπο',
      checkDigit: 'Ψηφίο ελέγχου',
    },
    qrcode: {
      content: 'Περιεχόμενο',
      magnification: 'Μέγεθος (1–10)',
      errorCorrection: 'Διόρθωση σφαλμάτων',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: 'Περιεχόμενο (12 ψηφία)',
      height: 'Ύψος (κουκκίδες)',
      printInterpretation: 'Αναγνώσιμο από άνθρωπο',
    },
    datamatrix: {
      content: 'Περιεχόμενο',
      dimension: 'Μέγεθος μονάδας (1–12)',
      quality: 'Ποιότητα',
      qualityAuto: '0 — Auto',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: 'Πλάτος (κουκκίδες)',
      height: 'Ύψος (κουκκίδες)',
      thickness: 'Πλαίσιο (κουκκίδες)',
      filled: 'Γεμισμένο',
      color: 'Χρώμα',
      colorB: 'B — Μαύρο',
      colorW: 'W — Λευκό',
    },
    line: {
      angle: 'Γωνία (°)',
      length: 'Μήκος (κουκκίδες)',
      thickness: 'Πάχος (κουκκίδες)',
      color: 'Χρώμα',
      colorB: 'B — Μαύρο',
      colorW: 'W — Λευκό',
    },
  },

  layers: {
    propertiesTab: 'Ιδιότητες',
    layersTab: 'Επίπεδα',
    empty: 'Δεν υπάρχουν αντικείμενα στην ετικέτα',
    toFront: 'Μεταφορά στο μπροστά',
    forward: 'Ένα επίπεδο μπροστά',
    backward: 'Ένα επίπεδο πίσω',
    toBack: 'Αποστολή στο πίσω',
  },
} as const;

export default el;
