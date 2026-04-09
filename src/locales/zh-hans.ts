const zhHans = {
  palette: {
    heading: '对象',
  },

  properties: {
    positionSection: '位置 (毫米)',
    x: 'X',
    y: 'Y',
  },

  label: {
    heading: '标签',
    preset: '预设',
    presetCustom: '自定义',
    width: '宽度 (毫米)',
    height: '高度 (毫米)',
    dpmm: '分辨率',
    dpmm6: '6 点/毫米 — 152 dpi',
    dpmm8: '8 点/毫米 — 203 dpi',
    dpmm12: '12 点/毫米 — 300 dpi',
    dpmm24: '24 点/毫米 — 600 dpi',
  },

  app: {
    file: '文件',
    importZpl: '导入 ZPL',
    exportZpl: '导出 ZPL',
    openDesign: '打开设计',
    saveDesign: '保存设计',
    print: '打印',
    propertiesTab: '属性',
    layersTab: '图层',
  },

  output: {
    zplHeading: 'ZPL',
    copy: '复制',
    copied: '✓ 已复制',
    noObjects: '// 标签上暂无对象',
    previewHeading: '预览',
    loading: '加载中…',
    unavailable: '不可用',
    previewEmpty: '更改后显示预览',
  },

  registry: {
    text: {
      content: '内容',
      fontHeight: '高度 (点)',
      fontWidth: '宽度 (点)',
      rotation: '旋转',
      rotationN: 'N — 正常',
      rotationR: 'R — 90°',
      rotationI: 'I — 180°',
      rotationB: 'B — 270°',
    },
    code128: {
      content: '内容',
      height: '高度 (点)',
      printInterpretation: '人工可读',
      checkDigit: '校验位',
    },
    box: {
      width: '宽度 (点)',
      height: '高度 (点)',
      thickness: '边框 (点)',
      filled: '填充',
      color: '颜色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
      rounding: '圆角 (0–8)',
    },
    code39: {
      content: '内容',
      height: '高度 (点)',
      printInterpretation: '人工可读',
      checkDigit: '校验位',
    },
    qrcode: {
      content: '内容',
      magnification: '大小 (1–10)',
      errorCorrection: '纠错级别',
      ecL: 'L — 7%',
      ecM: 'M — 15%',
      ecQ: 'Q — 25%',
      ecH: 'H — 30%',
    },
    ean13: {
      content: '内容 (12位数字)',
      height: '高度 (点)',
      printInterpretation: '人工可读',
    },
    datamatrix: {
      content: '内容',
      dimension: '模块大小 (1–12)',
      quality: '质量',
      qualityAuto: '0 — 自动',
      quality50: '50 — 2 of 5',
      quality80: '80 — 3 of 9',
      quality140: '140 — 4 of 9',
      quality200: '200 — ECC 200',
    },
    ellipse: {
      width: '宽度 (点)',
      height: '高度 (点)',
      thickness: '边框 (点)',
      filled: '填充',
      color: '颜色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
    },
    line: {
      angle: '角度 (°)',
      length: '长度 (点)',
      thickness: '粗细 (点)',
      color: '颜色',
      colorB: 'B — 黑色',
      colorW: 'W — 白色',
    },
  },

  layers: {
    propertiesTab: '属性',
    layersTab: '图层',
    empty: '标签上没有对象',
    toFront: '置于顶层',
    forward: '上移一层',
    backward: '下移一层',
    toBack: '置于底层',
  },
} as const;

export default zhHans;
