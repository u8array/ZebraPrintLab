import { useState, useEffect, useRef } from "react";
import { Group, Image as KImage, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { LabelObject } from "../../types/Group";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { getImage } from "../../lib/imageCache";
import { useColorScheme } from "../../lib/useColorScheme";
import { selectionHandlers, type KonvaObjectProps } from "./konvaObjectProps";

type ImageLabelObject = Extract<LabelObject, { type: "image" }>;
type Props = Omit<KonvaObjectProps, "obj"> & { obj: ImageLabelObject };

/** Image renderer. Hosted as its own component so hooks (useState/
 *  useEffect for async image loading) can run without violating
 *  rules-of-hooks. The dispatcher in KonvaObject narrows `obj`
 *  before passing — no runtime cast needed here. */
export function ImageObject({
  obj,
  scale,
  dpmm,
  offsetX,
  offsetY,
  isSelected,
  onSelect,
  onChange,
  snap,
}: Props) {
  const p = obj.props;
  const colors = useColorScheme();
  const cached = getImage(p.imageId);
  const w = dotsToPx(p.widthDots, scale, dpmm);
  // Guard against a 0-width cached image: the imageCache pipeline
  // doesn't normally produce one, but a malformed file could leak
  // through and div-by-zero would render NaN-sized canvas nodes.
  const h = cached && cached.width > 0
    ? w * (cached.height / cached.width)
    : w;
  const x = offsetX + dotsToPx(obj.x, scale, dpmm);
  const y = offsetY + dotsToPx(obj.y, scale, dpmm);

  const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null);
  // Reset the cached HTMLImageElement during render when the source changes,
  // instead of inside an effect. The "set state during render on prop change"
  // pattern is the official React workaround for what would otherwise be a
  // setState-in-effect anti-pattern. The next render observes prevDataUrl
  // already updated, so this does not loop.
  const prevDataUrlRef = useRef<string | undefined>(cached?.dataUrl);
  if (prevDataUrlRef.current !== cached?.dataUrl) {
    prevDataUrlRef.current = cached?.dataUrl;
    setHtmlImg(null);
  }
  useEffect(() => {
    if (!cached) return;
    let active = true;
    const img = new window.Image();
    img.src = cached.dataUrl;
    img.onload = () => {
      if (active) setHtmlImg(img);
    };
    return () => {
      active = false;
    };
  }, [cached]);

  // Snap during drag for visual feedback; commit only on dragEnd so
  // the store doesn't update on every mouse pixel. Mirrors the
  // pattern KonvaObjectInner uses for shape/text objects.
  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.position({
      x:
        offsetX +
        dotsToPx(snap(pxToDots(e.target.x() - offsetX, scale, dpmm)), scale, dpmm),
      y:
        offsetY +
        dotsToPx(snap(pxToDots(e.target.y() - offsetY, scale, dpmm)), scale, dpmm),
    });
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({
      x: pxToDots(e.target.x() - offsetX, scale, dpmm),
      y: pxToDots(e.target.y() - offsetY, scale, dpmm),
    });
  };

  if (htmlImg && cached) {
    return (
      <KImage
        id={obj.id}
        x={x}
        y={y}
        image={htmlImg}
        width={w}
        height={h}
        stroke={isSelected ? colors.selection : undefined}
        strokeWidth={isSelected ? 2 : 0}
        draggable={!obj.locked}
        {...selectionHandlers(onSelect)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    );
  }

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable={!obj.locked}
      {...selectionHandlers(onSelect)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={w}
        height={h}
        fill="#f9fafb"
        stroke={isSelected ? colors.selection : "#9ca3af"}
        strokeWidth={isSelected ? 2 : 1}
        dash={[4, 2]}
      />
      <Text
        x={6}
        y={6}
        text="🖼"
        fontSize={Math.max(w * 0.3, 12)}
        fill="#374151"
      />
    </Group>
  );
}
