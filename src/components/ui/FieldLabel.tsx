import { InformationCircleIcon } from '@heroicons/react/16/solid';
import { labelCls } from '../Properties/styles';
import { Tooltip } from './Tooltip';

/** Section / input label styled like the rest of the right sidebar
 *  (small-caps muted text), optionally with a hover-help info icon.
 *  Centralises the icon + sizing + cursor styling so every panel
 *  shares the same look. ZPL command codes belong only in the help
 *  string, never in the visible label text. */
export function FieldLabel({ text, help }: { text: string; help?: string }) {
  if (!help) {
    return <span className={labelCls}>{text}</span>;
  }
  return (
    <span className={`${labelCls} flex items-center gap-1`}>
      {text}
      <Tooltip content={help}>
        <InformationCircleIcon className="w-3 h-3 text-muted/60 cursor-help" />
      </Tooltip>
    </span>
  );
}
