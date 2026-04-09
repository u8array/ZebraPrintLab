import { useEffect, useState } from 'react';

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
  rulerMajorTick: '#888888',
  rulerMinorTick: '#484848',
  rulerLabel:     '#777777',
  rulerSeparator: '#2a2a2a',
};

export const LIGHT_COLORS: CanvasColors = {
  canvasBg:       '#ededf3',
  canvasDot:      '#bebecf',
  gridLine:       '#b0b0c4',
  gridSub:        '#d0d0de',
  rulerBg:        '#f0f0f6',
  rulerCorner:    '#e6e6f0',
  rulerMajorTick: '#8080a0',
  rulerMinorTick: '#c0c0d4',
  rulerLabel:     '#6060a0',
  rulerSeparator: '#d0d0e0',
};

export function useColorScheme(): CanvasColors {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDark ? DARK_COLORS : LIGHT_COLORS;
}
