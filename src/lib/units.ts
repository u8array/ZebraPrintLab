export type Unit = 'mm' | 'cm' | 'in';

export function mmToUnit(mm: number, unit: Unit): number {
  if (unit === 'cm') return Math.round((mm / 10) * 100) / 100;
  if (unit === 'in') return Math.round((mm / 25.4) * 1000) / 1000;
  return Math.round(mm * 10) / 10;
}

export function unitToMm(value: number, unit: Unit): number {
  if (unit === 'cm') return value * 10;
  if (unit === 'in') return value * 25.4;
  return value;
}

export function unitLabel(unit: Unit): string {
  return unit;
}

export function unitStep(unit: Unit): number {
  if (unit === 'cm') return 0.1;
  if (unit === 'in') return 0.01;
  return 0.5;
}

/** Tick spacing for ruler, returned in mm. */
export function rulerTicksMm(scalePxPerMm: number, unit: Unit): { major: number; minor: number } {
  if (unit === 'in') {
    // nice inch fractions
    if (scalePxPerMm >= 10) return { major: 25.4 / 4, minor: 25.4 / 8 };  // 0.25" / 0.125"
    if (scalePxPerMm >= 5)  return { major: 25.4 / 2, minor: 25.4 / 4 };  // 0.5"  / 0.25"
    return                         { major: 25.4,      minor: 25.4 / 2 };  // 1"    / 0.5"
  }
  if (unit === 'cm') {
    if (scalePxPerMm >= 10) return { major: 5,  minor: 1  };  // 0.5cm / 0.1cm
    if (scalePxPerMm >= 5)  return { major: 10, minor: 5  };  // 1cm   / 0.5cm
    return                         { major: 20, minor: 10 };  // 2cm   / 1cm
  }
  // mm
  if (scalePxPerMm >= 10) return { major: 5,  minor: 1  };
  if (scalePxPerMm >= 5)  return { major: 10, minor: 5  };
  return                         { major: 20, minor: 10 };
}

/** Format a mm value as a ruler label in the current unit. */
export function rulerLabel(mm: number, unit: Unit): string {
  if (unit === 'in') {
    const inches = mm / 25.4;
    // show as fraction-friendly decimal
    return (Math.round(inches * 100) / 100).toString();
  }
  if (unit === 'cm') return (Math.round(mm / 10 * 10) / 10).toString();
  return mm.toString();
}
