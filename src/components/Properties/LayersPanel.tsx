import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
} from '@heroicons/react/16/solid';
import { useLabelStore } from '../../store/labelStore';
import { ObjectRegistry } from '../../registry';
import t from '../../locales/en';

export function LayersPanel() {
  const {
    objects,
    selectedId,
    selectObject,
    moveObjectForward,
    moveObjectBackward,
    moveObjectToFront,
    moveObjectToBack,
  } = useLabelStore();

  if (objects.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-xs mt-6">
        {t.layers.empty}
      </div>
    );
  }

  // Reverse so the topmost layer (last in array = front) appears first in the list
  const reversed = [...objects].reverse();

  return (
    <div className="flex flex-col">
      {reversed.map((obj, i) => {
        const def = ObjectRegistry[obj.type];
        const isSelected = obj.id === selectedId;
        const isFirst = i === 0; // visually topmost = front
        const isLast = i === reversed.length - 1; // visually bottommost = back

        return (
          <div
            key={obj.id}
            onClick={() => selectObject(obj.id)}
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer border-b border-border group transition-colors hover:bg-surface-2 ${
              isSelected
                ? 'bg-surface-2 border-l-2 border-l-accent'
                : 'border-l-2 border-l-transparent'
            }`}
          >
            <span className="font-mono text-xs text-accent shrink-0 w-4 text-center">
              {def?.icon}
            </span>

            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs text-text truncate">{def?.label ?? obj.type}</span>
              <span className="font-mono text-[9px] text-muted">{obj.id.slice(0, 8)}</span>
            </div>

            {/* Z-order action buttons — visible on hover */}
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); moveObjectToFront(obj.id); }}
                disabled={isFirst}
                title={t.layers.toFront}
                className="p-0.5 rounded text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDoubleUpIcon className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveObjectForward(obj.id); }}
                disabled={isFirst}
                title={t.layers.forward}
                className="p-0.5 rounded text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUpIcon className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveObjectBackward(obj.id); }}
                disabled={isLast}
                title={t.layers.backward}
                className="p-0.5 rounded text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDownIcon className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveObjectToBack(obj.id); }}
                disabled={isLast}
                title={t.layers.toBack}
                className="p-0.5 rounded text-muted hover:text-text disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDoubleDownIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
