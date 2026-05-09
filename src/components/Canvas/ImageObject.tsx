import { useState, useEffect, useRef } from "react";
import { Group, Image as KImage, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { LabelObject } from "../../registry";
import { dotsToPx, pxToDots } from "../../lib/coordinates";
import { getImage } from "../../lib/imageCache";
import type { KonvaObjectProps } from "./konvaObjectProps";

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
}: Props) {
  const p = obj.props;
  const cached = getImage(p.imageId);
  const w = dotsToPx(p.widthDots, scale, dpmm);
  const h = cached ? w * (cached.height / cached.width) : w;
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

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
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
        stroke={isSelected ? "#6366f1" : undefined}
        strokeWidth={isSelected ? 2 : 0}
        draggable
        onClick={(e) =>
          onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        }
        onTap={() => onSelect(false)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragMove}
      />
    );
  }

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable
      onClick={(e) =>
        onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
      }
      onTap={() => onSelect(false)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragMove}
    >
      <Rect
        width={w}
        height={h}
        fill="#f9fafb"
        stroke={isSelected ? "#6366f1" : "#9ca3af"}
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
