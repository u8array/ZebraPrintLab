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
};

export const LIGHT_COLORS: CanvasColors = {
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
};

export function useColorScheme(): CanvasColors {
  const theme = useLabelStore((s) => s.theme);
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}
