import { useState, type ComponentType, type RefObject } from 'react';
import {
  AdjustmentsHorizontalIcon,
  RectangleStackIcon,
  VariableIcon,
} from '@heroicons/react/16/solid';
import { PropertiesPanel } from '../Properties/PropertiesPanel';
import { LayersPanel } from '../Properties/LayersPanel';
import { FontManager } from '../Fonts/FontManager';
import { VariablesPanel } from '../Variables/VariablesPanel';
import { useT } from '../../lib/useT';
import type { LabelCanvasHandle } from '../Canvas/LabelCanvas';
import { AaIcon } from './AaIcon';

type TabId = 'properties' | 'layers' | 'variables' | 'fonts';

interface Props {
  canvasRef: RefObject<LabelCanvasHandle | null>;
}

interface TabDef {
  id: TabId;
  /** Tooltip + aria-label. Icons in the strip are otherwise unlabelled. */
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

export function RightSidebar({ canvasRef }: Props) {
  const t = useT();
  const [tab, setTab] = useState<TabId>('properties');

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
      <div className="flex shrink-0 border-b border-border" role="tablist">
        {tabs.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              aria-label={label}
              title={label}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center py-2 transition-colors ${
                active
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
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
