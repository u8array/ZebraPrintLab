import { useLabelStore } from '../store/labelStore';

export interface CanvasColors {
  canvasBg: string;
  canvasDot: string;
  gridLine: string;
  gridSub: string;
  rulerBg: string;
  rulerCorner: string;
  rulerMajorTick: string;
  rulerMinorTick: string;
  rulerLabel: string;
  rulerSeparator: string;
  /** Selection stroke / handle colour for shapes and the Konva Transformer.
   *  Distinct from the UI accent (amber) on purpose; design tools follow
   *  a blue-ish convention here (Figma, Sketch, Illustrator) to keep
   *  contrast usable across the B/W shape colour space. */
  selection: string;
  /** UI accent (amber). Used for non-selection design-affordance overlays
   *  on the canvas; e.g. the ^FB wrap-guide line so the user can tell
   *  it apart from selection/transformer chrome. */
  accent: string;
}

export const DARK_COLORS: CanvasColors = {
  canvasBg:       '#222222',
  canvasDot:      '#2c2c2c',
  gridLine:       '#bebebe',
  gridSub:        '#d8d8d8',
  rulerBg:        '#161616',
  rulerCorner:    '#111111',
  rulerMajorTick: '#b0b0b0',
  rulerMinorTick: '#686868',
  rulerLabel:     '#cccccc',
  rulerSeparator: '#2a2a2a',
  selection:      '#6366f1',
  accent:         '#f59e0b',
};

const LIGHT_COLORS: CanvasColors = {
  canvasBg:       '#e4e4e7',
  canvasDot:      '#dcdce0',
  gridLine:       '#a1a1aa',
  gridSub:        '#d4d4d8',
  rulerBg:        '#f4f4f5',
  rulerCorner:    '#e4e4e7',
  rulerMajorTick: '#3f3f46',
  rulerMinorTick: '#71717a',
  rulerLabel:     '#27272a',
  rulerSeparator: '#d4d4d8',
  selection:      '#6366f1',
  accent:         '#d97706',
};

export function useColorScheme(): CanvasColors {
  const theme = useLabelStore((s) => s.theme);
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}
