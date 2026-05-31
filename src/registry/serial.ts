import type { ObjectTypeCore } from "../types/ObjectType";
import { textFieldPos, fdField, resolveFontCmd } from "./zplHelpers";
import { effectiveScale } from "./transformHelpers";
import { filterContent, type ContentSpec } from "./contentSpec";

export const serialSpec: ContentSpec = { charset: "0-9A-Za-z" };

export interface SerialProps {
  content: string;
  increment: number;
  fontHeight: number;
  fontWidth: number;
  rotation: "N" | "R" | "I" | "B";
  zplMode: "SF" | "SN";
}

export const serial: ObjectTypeCore<SerialProps> = {
  label: "Serial",
  icon: "#",
  group: "text" as const,
  defaultProps: {
    content: "001",
    increment: 1,
    fontHeight: 30,
    fontWidth: 0,
    rotation: "N",
    zplMode: "SN",
  },
  defaultSize: { width: 100, height: 30 },
  // Rectangle resize matching text.ts — see notes there.
  commitTransform: (obj, ctx) => {
    const oldH = obj.props.fontHeight;
    const oldW = obj.props.fontWidth > 0 ? obj.props.fontWidth : oldH;
    const { esx, esy } = effectiveScale(obj.props.rotation, ctx);
    return {
      fontHeight: Math.max(1, ctx.snap(Math.round(oldH * esy))),
      fontWidth: Math.max(1, ctx.snap(Math.round(oldW * esx))),
    };
  },

  toZPL: (obj, ctx) => {
    const p = obj.props;
    const field = `${textFieldPos(obj)}${resolveFontCmd(p, ctx)}`;
    // Re-apply the input charset filter at emit time so ZPL-imported content
    // (which bypasses the in-app filter) can't smuggle ^/~ into the ^SN start
    // parameter or comma-split the parameter list. fdField additionally
    // hex-escapes any survivors in the FD payload — belt and suspenders.
    const safe = filterContent(p.content, serialSpec);
    if (p.zplMode === "SF") {
      // ^SF: increment, pad-digits (derived from content length), change-per-label
      return `${field}^SF${p.increment},${safe.length},Y${fdField(safe)}`;
    }
    // ^SN: start, increment, change-per-label
    return `${field}^SN${safe},${p.increment},Y${fdField(safe)}`;
  },
};
