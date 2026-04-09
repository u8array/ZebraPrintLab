const zhHant = {
  palette: {
    heading: '物件',
  },

  properties: {
    positionSection: '位置 (公釐)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: '標籤',
    preset: '預設',
    presetCustom: '自訂',
    width: '寬度 (公釐)',
    height: '高度 (公釐)',
    dpmm: '解析度',
    dpmm6: '6 點/公釐 — 152 dpi',
    dpmm8: '8 點/公釐 — 203 dpi',
    dpmm12: '12 點/公釐 — 300 dpi',
    dpmm24: '24 點/公釐 — 600 dpi',
  },

  app: {
    file: '檔案',
    importZpl: '匯入 ZPL',
    exportZpl: '匯出 ZPL',
    openDesign: '開啟設計',
    saveDesign: '儲存設計',
    print: '列印',
    propertiesTab: '屬性',
    layersTab: '圖層',
  },

  output: {
    zplHeading: 'ZPL',
    copy: '複製',
    copied: '✓ 已複製',
    noObjects: '// 標籤上尚無物件',
    previewHeading: '預覽',
    loading: '載入中…',
    unavailable: '無法使用',
    previewEmpty: '變更後顯示預覽',
  },

  registry: {
    text: {
      content: '內容',
      fontHeight: '高度 (點)',
      fontWidth: '寬度 (點)',
      rotation: '旋轉',
      rotationN: 'N — 正常',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: '內容',
      height: '高度 (點)',
      printInterpretation: '人工可讀',
      checkDigit: '校驗碼',
    },
    box: {
      width: '寬度 (點)',
      height: '高度 (點)',
      thickness: '框線 (點)',
      filled: '填滿',
      color: '顏色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
      rounding: '圓角 (0–8)',
    },
    code39: {
      content: '內容',
      height: '高度 (點)',
      printInterpretation: '人工可讀',
      checkDigit: '校驗碼',
    },
    qrcode: {
      content: '內容',
      magnification: '大小 (1–10)',
      errorCorrection: '錯誤修正',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: '內容 (12位數字)',
      height: '高度 (點)',
      printInterpretation: '人工可讀',
    },
    datamatrix: {
      content: '內容',
      dimension: '模組大小 (1–12)',
      quality: '品質',
      qualityAuto: '0 — 自動',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: '寬度 (點)',
      height: '高度 (點)',
      thickness: '框線 (點)',
      filled: '填滿',
      color: '顏色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
    },
    line: {
      angle: '角度 (°)',
      length: '長度 (點)',
      thickness: '粗細 (點)',
      color: '顏色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
    },
  },

  layers: {
    propertiesTab: '屬性',
    layersTab: '圖層',
    empty: '標籤上沒有物件',
    toFront: '移至最上層',
    forward: '上移一層',
    backward: '下移一層',
    toBack: '移至最下層',
  },
} as const;

export default zhHant;
