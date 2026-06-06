import { useState, useEffect, useRef, type ReactElement } from "react";
import { Group, Image as KImage, Path, Rect } from "react-konva";
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
 *  before passing; no runtime cast needed here. */
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
  // Aspect-lock when a real PNG is cached; fall back to `heightDots` for
  // recall-only placeholders so the user can shape the box freely. Guard
  // against 0-width cached images (malformed file edge case); div-by-
  // zero would otherwise render NaN-sized canvas nodes.
  const h = cached && cached.width > 0
    ? w * (cached.height / cached.width)
    : dotsToPx(p.heightDots ?? p.widthDots, scale, dpmm);
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
      <PlaceholderIcon w={w} h={h} />
    </Group>
  );
}

/** Heroicons "photo" outline rendered via Konva.Path so the placeholder
 *  is OS-independent. We previously used the 🖼 emoji which rendered
 *  inconsistently (color on macOS, monochrome on Linux, missing on
 *  some Windows configurations). */
const PHOTO_ICON_PATH =
  "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z";
const PHOTO_ICON_VIEWBOX = 24;

function PlaceholderIcon({ w, h }: { w: number; h: number }): ReactElement {
  // Centre the icon at 60% of the smaller dimension; clamp so a thin
  // image strip still shows something visible. Stroke-only mirrors
  // Heroicons' outline style.
  const target = Math.max(Math.min(w, h) * 0.6, 12);
  const scale = target / PHOTO_ICON_VIEWBOX;
  return (
    <Path
      data={PHOTO_ICON_PATH}
      x={(w - target) / 2}
      y={(h - target) / 2}
      scaleX={scale}
      scaleY={scale}
      stroke="#6b7280"
      strokeWidth={1.5 / scale}
      fillEnabled={false}
      lineCap="round"
      lineJoin="round"
    />
  );
}
