import { forwardRef, useEffect, useRef, useState } from "react";
import { Group, Circle, Path } from "react-konva";
import type Konva from "konva";

interface Props {
  color: string;
  onClick: () => void;
  /** 24x24 SVG path data; centred and scaled into the button. */
  iconPath: string;
}

export const RADIUS = 11;
const ICON_SCALE = 0.55;
const ICON_OFFSET = 12; // 24x24 viewBox centre

/**
 * Floating glyph button for the canvas selection action bar (rotate, lock,
 * delete). Mounted in stage-space outside the view-rotation Group so it stays
 * upright; the parent bar Group is positioned imperatively in a beforeDraw hook
 * while each button gets a static row offset.
 */
export const FloatingCanvasButton = forwardRef<Konva.Group, Props>(
  function FloatingCanvasButton({ color, onClick, iconPath }, ref) {
    const [hover, setHover] = useState(false);
    // Track the stage so an unmount-while-hovering (e.g. the action clears the
    // selection) still resets the cursor; onMouseLeave never fires then.
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
        {/* Invisible hitbox; gives the thin icon a comfortable click target. */}
        <Circle radius={RADIUS} fill="transparent" />
        <Group
          scaleX={ICON_SCALE}
          scaleY={ICON_SCALE}
          offsetX={ICON_OFFSET}
          offsetY={ICON_OFFSET}
          listening={false}
        >
          <Path
            data={iconPath}
            stroke={color}
            strokeWidth={hover ? 3 : 2}
            lineCap="round"
            lineJoin="round"
            fill="transparent"
          />
        </Group>
      </Group>
    );
  },
);
