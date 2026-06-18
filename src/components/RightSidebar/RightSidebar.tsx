import { type ComponentType, type RefObject } from 'react';
import {
  AdjustmentsHorizontalIcon,
  RectangleStackIcon,
  VariableIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/16/solid';
import { PropertiesPanel } from '../Properties/PropertiesPanel';
import { LayersPanel } from '../Properties/LayersPanel';
import { FontManager } from '../Fonts/FontManager';
import { VariablesPanel } from '../Variables/VariablesPanel';
import { useT } from '../../lib/useT';
import { useLabelStore } from '../../store/labelStore';
import type { LabelCanvasHandle } from '../Canvas/LabelCanvas';
import { AaIcon } from './AaIcon';
import { Tooltip } from '../ui/Tooltip';

type TabId = 'properties' | 'layers' | 'variables' | 'fonts';

interface Props {
  canvasRef: RefObject<LabelCanvasHandle | null>;
  onCollapse?: () => void;
}

interface TabDef {
  id: TabId;
  /** Tooltip + aria-label. Icons in the strip are otherwise unlabelled. */
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

export function RightSidebar({ canvasRef, onCollapse }: Props) {
  const t = useT();
  // Tab state lives in the store so canvas interactions (e.g. double-
  // click a text field) can switch the sidebar to Properties +
  // request the content editor's focus in one atomic action.
  const tab = useLabelStore((s) => s.sidebarTab);
  const setTab = useLabelStore((s) => s.setSidebarTab);

  // Ordering rule: selection scope first (Properties), then document-wide
  // concerns by usage frequency (Layers, Variables, Fonts).
  const tabs: TabDef[] = [
    { id: 'properties', label: t.layers.propertiesTab, Icon: AdjustmentsHorizontalIcon },
    { id: 'layers', label: t.layers.layersTab, Icon: RectangleStackIcon },
    { id: 'variables', label: t.layers.variablesTab, Icon: VariableIcon },
    { id: 'fonts', label: t.layers.fontsTab, Icon: AaIcon },
  ];

  return (
    <aside className="w-64 shrink-0 border-l border-border bg-surface flex flex-col">
      <div className="flex shrink-0 border-b border-border">
        <div className="flex flex-1" role="tablist">
          {tabs.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <Tooltip key={id} content={label} className="flex-1">
              <button
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center py-2 transition-colors ${
                  active
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted hover:text-text'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            </Tooltip>
          );
          })}
        </div>
        {onCollapse && (
          <Tooltip content={t.app.collapse}>
            <button
              onClick={onCollapse}
              aria-label={t.app.collapse}
              className="px-2 flex items-center justify-center border-l border-border text-muted hover:text-text transition-colors"
            >
              <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'properties' && <PropertiesPanel canvasRef={canvasRef} />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'variables' && <VariablesPanel />}
        {tab === 'fonts' && <FontManager />}
      </div>
    </aside>
  );
}
