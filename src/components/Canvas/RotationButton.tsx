import { forwardRef, useEffect, useRef, useState } from "react";
import { Group, Circle, Path } from "react-konva";
import type Konva from "konva";

/**
 * Floating "rotate 90°" glyph for step-rotation objects (text/serial/
 * barcodes; N/R/I/B). Mounted in stage-space (outside the view-rotation
 * Group so the glyph stays upright) and positioned imperatively via ref
 * in a beforeDraw hook.
 */
interface Props {
  color: string;
  onClick: () => void;
}

const RADIUS = 11;
// Lucide "rotate-cw" (24x24). Single-arrow rotation glyph; the
// universally-recognised "rotate 90°" icon (Photoshop / Figma / Word all
// use this shape). Drawn as a Konva Path scaled down and centred on the
// button origin via a wrapping Group.
const ARROW_PATH_ICON =
  "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5";
const ICON_SCALE = 0.55;
const ICON_OFFSET = 12; // 24x24 viewBox → centre at (12, 12)

export const RotationButton = forwardRef<Konva.Group, Props>(function RotationButton(
  { color, onClick },
  ref,
) {
  const [hover, setHover] = useState(false);
  // Track the stage we set a cursor on so unmount-while-hovering can still
  // clean up (onMouseLeave never fires in that case; e.g. user hits Delete
  // or Esc while the cursor is over the button).
  const cursorStageRef = useRef<Konva.Stage | null>(null);

  const cursorIn = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (stage) {
      stage.container().style.cursor = "pointer";
      cursorStageRef.current = stage;
    }
    setHover(true);
  };
  const cursorOut = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = "";
    cursorStageRef.current = null;
    setHover(false);
  };

  useEffect(() => {
    return () => {
      const stage = cursorStageRef.current;
      if (stage) stage.container().style.cursor = "";
    };
  }, []);

  return (
    <Group
      ref={ref}
      onMouseEnter={cursorIn}
      onMouseLeave={cursorOut}
      onClick={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
    >
      {/* Invisible hitbox; gives the icon a comfortable click target
          even though the icon path itself is thin. */}
      <Circle radius={RADIUS} fill="transparent" />
      <Group
        scaleX={ICON_SCALE}
        scaleY={ICON_SCALE}
        offsetX={ICON_OFFSET}
        offsetY={ICON_OFFSET}
        listening={false}
      >
        <Path
          data={ARROW_PATH_ICON}
          stroke={color}
          strokeWidth={hover ? 3 : 2}
          lineCap="round"
          lineJoin="round"
          fill="transparent"
        />
      </Group>
    </Group>
  );
});
