import type { ObjectTypeCore } from "../types/ObjectType";
import { fieldPos, fdFieldFor } from "./zplHelpers";
import { type ZplRotation } from "./rotation";

export const MAGNIFICATION_MIN = 1;
export const MAGNIFICATION_MAX = 10;
export const EC_LEVEL_MIN = 0;
// NumberInput can't express the discontinuous AztecProps domain; use the
// highest valid value (Rune = 300) as the upper bound.
export const EC_LEVEL_MAX = 300;

export interface AztecProps {
  content: string;
  magnification: number; // module size in dots
  ecLevel: number; // 0=default, 1-99=error correction %, 101-104=compact, 201-232=full, 300=rune
  rotation: ZplRotation;
}

export const aztec: ObjectTypeCore<AztecProps> = {
  label: "Aztec",
  icon: "◇",
  group: "code-2d",
  bindable: true,
  defaultProps: {
    content: "1234567890",
    magnification: 4,
    ecLevel: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 200 },

  uniformScaleProp: { name: 'magnification', min: MAGNIFICATION_MIN, max: MAGNIFICATION_MAX },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    // ^B0 a,b,c,d,e,f,g = orientation, magnification, ecic, errorControl,
    // menuSymbol, numberOfSymbols, structuredID. ecLevel=0 is Zebra's
    // documented default for errorControl, so emitting it as-is is valid.
    return [
      fieldPos(obj),
      `^B0${p.rotation},${p.magnification},N,${p.ecLevel}`,
      fdFieldFor(obj, p.content, ctx),
    ].join("");
  },
};
