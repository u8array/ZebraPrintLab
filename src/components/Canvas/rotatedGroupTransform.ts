// Inner-Group transform so children render upright; outer bbox stays a
// positive rect. Konva y-down, CW rotation positive.
//   R: +90, translate (+H, 0). I: +180, (+W, +H). B: -90, (0, +W).

export type ZplRotation = "N" | "R" | "I" | "B";

export interface RotatedGroupTransform {
  x: number;
  y: number;
  rotation: number;
}

export function rotatedGroupTransform(
  rotation: ZplRotation,
  uprightW: number,
  uprightH: number,
): RotatedGroupTransform {
  switch (rotation) {
    case "N":
      return { x: 0, y: 0, rotation: 0 };
    case "R":
      return { x: uprightH, y: 0, rotation: 90 };
    case "I":
      return { x: uprightW, y: uprightH, rotation: 180 };
    case "B":
      return { x: 0, y: uprightW, rotation: -90 };
  }
}

