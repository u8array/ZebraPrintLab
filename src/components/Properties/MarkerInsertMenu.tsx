import { VariableIcon } from "@heroicons/react/16/solid";
import { ContextMenu, type MenuSection } from "../ui/ContextMenu";
import { CLOCK_TOKEN_LABELS, clockMarkerBody, type ClockChannel } from "@zplab/core/lib/fcTemplate";
import { useT } from "../../hooks/useT";
import { useLabelStore } from "../../store/labelStore";
import { useContextMenu } from "../../hooks/useContextMenu";

/** Compact insert dropdown for builder value fields: variables flat, clock
 *  tokens per channel as submenus. Emits the marker BODY; the host field
 *  wraps it in `«…»` and places it at its caret. */
export function MarkerInsertMenu({ onInsert }: { onInsert: (body: string) => void }) {
  const t = useT();
  const variables = useLabelStore((s) => s.variables);
  const { menu, openBelowAnchor, close } = useContextMenu<null>();

  const channelItems = (channel: ClockChannel) =>
    CLOCK_TOKEN_LABELS.map((e) => ({
      id: `c${channel}:${e.token}`,
      label: t.app[e.labelKey],
      run: () => onInsert(clockMarkerBody(channel, e.token)),
    }));

  const sections: MenuSection[] = [
    {
      id: "vars",
      // Only insert PRE-DEFINED variables; creation lives in the Variables tab.
      // A disabled hint keeps the section visible so the affordance is
      // discoverable even with no variables yet.
      items:
        variables.length > 0
          ? variables.map((v) => ({
              id: `v:${v.id}`,
              label: v.defaultValue ? `${v.name} · "${v.defaultValue}"` : v.name,
              run: () => onInsert(v.name),
            }))
          : [{ id: "empty", label: t.variables.empty, disabled: true }],
    },
    {
      id: "clock",
      items: [
        { id: "ch1", label: t.app.clockChannelPrimary, submenu: channelItems(1) },
        { id: "ch2", label: t.app.clockChannelSecondary, submenu: channelItems(2) },
        { id: "ch3", label: t.app.clockChannelTertiary, submenu: channelItems(3) },
      ],
    },
  ].filter((s) => s.items.length > 0);

  return (
    <>
      <button
        type="button"
        aria-label={t.app.insertVariable}
        title={t.app.insertVariable}
        onClick={(e) => openBelowAnchor(e.currentTarget, null)}
        className="shrink-0 p-1 rounded text-muted hover:text-accent hover:bg-surface-2 transition-colors"
      >
        <VariableIcon className="w-3.5 h-3.5" />
      </button>
      {menu && <ContextMenu sections={sections} x={menu.x} y={menu.y} onClose={close} />}
    </>
  );
}
