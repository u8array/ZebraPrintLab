import { forwardRef, useEffect, useRef, useState } from "react";
import { Group, Circle, Path } from "react-konva";
import type Konva from "konva";
import { useColorScheme } from "../../lib/useColorScheme";

/** Visual role of a button: drives resting/hover icon colour and the hover
 *  fill. `neutral` = muted→indigo, `active` = amber (e.g. unlock while locked),
 *  `destructive` = muted→red with a red-tinted hover fill (delete). */
export type ButtonTone = "neutral" | "active" | "destructive";

interface Props {
  onClick: () => void;
  /** 24x24 SVG path data; centred and scaled into the button. */
  iconPath: string;
  tone?: ButtonTone;
}

export const RADIUS = 15;
const FILL_RADIUS = 13;
const ICON_SCALE = 0.5;
const ICON_OFFSET = 12; // 24x24 viewBox centre

/**
 * Floating glyph button for the canvas selection action bar. Icons rest in a
 * neutral tone and pick up their accent (indigo / amber / red) on hover, with a
 * soft fill highlight so it's obvious which button is active. Mounted in
 * stage-space outside the view-rotation Group so it stays upright; the parent
 * bar Group is positioned imperatively in a beforeDraw hook.
 */
export const FloatingCanvasButton = forwardRef<Konva.Group, Props>(
  function FloatingCanvasButton({ onClick, iconPath, tone = "neutral" }, ref) {
    const colors = useColorScheme();
    const [hover, setHover] = useState(false);
    // Track the stage so an unmount-while-hovering (e.g. the action clears the
    // selection) still resets the cursor; onMouseLeave never fires then.
    const cursorStageRef = useRef<Konva.Stage | null>(null);

    const palette =
      tone === "destructive"
        ? { rest: colors.muted, active: colors.error, fill: colors.error, fillOpacity: 0.15 }
        : tone === "active"
          ? { rest: colors.accent, active: colors.accent, fill: colors.surface2, fillOpacity: 1 }
          : { rest: colors.muted, active: colors.selection, fill: colors.surface2, fillOpacity: 1 };
    const iconColor = hover ? palette.active : palette.rest;

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
        {hover && (
          <Circle
            radius={FILL_RADIUS}
            fill={palette.fill}
            opacity={palette.fillOpacity}
            listening={false}
          />
        )}
        <Group
          scaleX={ICON_SCALE}
          scaleY={ICON_SCALE}
          offsetX={ICON_OFFSET}
          offsetY={ICON_OFFSET}
          listening={false}
        >
          <Path
            data={iconPath}
            stroke={iconColor}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
            fill="transparent"
          />
        </Group>
      </Group>
    );
  },
);
