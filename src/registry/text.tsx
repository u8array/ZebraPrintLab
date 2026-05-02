import { useRef, useState, useCallback } from 'react';
import type { ObjectTypeDefinition } from '../types/ObjectType';
import { useT } from '../lib/useT';
import { inputCls, labelCls } from '../components/Properties/styles';
import { fieldPos } from './zplHelpers';
import { getFont, getAllFonts, loadFontFile, useFontCacheVersion } from '../lib/fontCache';

export interface TextProps {
  content: string;
  fontHeight: number;
  fontWidth: number;
  rotation: 'N' | 'R' | 'I' | 'B';
  reverse?: boolean;
  /** Printer TrueType font filename from ^A@ (e.g. "ARIAL.TTF") */
  printerFontName?: string;
  /** ^FB field block properties */
  blockWidth?: number;
  blockLines?: number;
  blockLineSpacing?: number;
  blockJustify?: 'L' | 'C' | 'R' | 'J';
}

export const text: ObjectTypeDefinition<TextProps> = {
  label: 'Text',
  icon: 'T',
  group: 'text' as const,
  defaultProps: {
    content: 'Text',
    fontHeight: 30,
    fontWidth: 0,
    rotation: 'N',
  },
  defaultSize: { width: 200, height: 40 },

  toZPL: (obj) => {
    const p = obj.props;
    const fontCmd = p.printerFontName
      ? `^A@${p.rotation},${p.fontHeight},${p.fontWidth},E:${p.printerFontName}`
      : `^A0${p.rotation},${p.fontHeight},${p.fontWidth}`;
    const fbCmd = p.blockWidth
      ? `^FB${p.blockWidth},${p.blockLines ?? 1},${p.blockLineSpacing ?? 0},${p.blockJustify ?? 'L'},0`
      : '';
    return [
      p.reverse ? '^LRY' : '',
      fieldPos(obj),
      fontCmd,
      fbCmd,
      `^FD${p.content}^FS`,
      p.reverse ? '^LRN' : '',
    ].filter(Boolean).join('');
  },

  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    useFontCacheVersion();

    const loadedFonts = getAllFonts();
    const fontLoaded = !!p.printerFontName && !!getFont(p.printerFontName);
    const fontAssignedButMissing = !!p.printerFontName && !fontLoaded;

    const handleFontUpload = useCallback(async (file: File) => {
      if (!p.printerFontName) return;
      setUploading(true);
      try {
        await loadFontFile(file, p.printerFontName);
      } finally {
        setUploading(false);
      }
    }, [p.printerFontName]);

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.printerFont}</label>
          <select
            className={inputCls}
            value={p.printerFontName ?? ''}
            onChange={(e) => onChange({ printerFontName: e.target.value || undefined })}
          >
            <option value="">{t.registry.text.noFont}</option>
            {loadedFonts.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
            {p.printerFontName && !getFont(p.printerFontName) && (
              <option value={p.printerFontName}>{p.printerFontName}</option>
            )}
          </select>
          {fontLoaded && (
            <span className="text-[10px] text-accent font-mono">{t.registry.text.fontLoaded}</span>
          )}
          {fontAssignedButMissing && (
            <>
              <span className="text-[10px] text-muted font-mono">{t.registry.text.fontMissing}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".ttf,.otf,.TTF,.OTF"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFontUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="px-3 py-1.5 rounded text-xs font-mono bg-surface-2 border border-border text-text hover:bg-border transition-colors"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? t.registry.text.uploadingFont : t.registry.text.uploadFont}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.content}</label>
          <input
            className={inputCls}
            value={p.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.text.fontHeight}</label>
            <input
              type="number"
              className={inputCls}
              value={p.fontHeight}
              min={1}
              onChange={(e) => onChange({ fontHeight: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t.registry.text.fontWidth}</label>
            <input
              type="number"
              className={inputCls}
              value={p.fontWidth}
              min={0}
              onChange={(e) => onChange({ fontWidth: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.rotation}</label>
          <select
            className={inputCls}
            value={p.rotation}
            onChange={(e) => onChange({ rotation: e.target.value as TextProps['rotation'] })}
          >
            <option value="N">{t.registry.text.rotationN}</option>
            <option value="R">{t.registry.text.rotationR}</option>
            <option value="I">{t.registry.text.rotationI}</option>
            <option value="B">{t.registry.text.rotationB}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={p.reverse ?? false}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          <span className={labelCls}>{t.registry.text.reverse}</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!p.blockWidth}
            onChange={(e) => onChange(e.target.checked
              ? { blockWidth: 400, blockLines: 3, blockLineSpacing: 0, blockJustify: 'L' }
              : { blockWidth: undefined, blockLines: undefined, blockLineSpacing: undefined, blockJustify: undefined },
            )}
          />
          <span className={labelCls}>{t.registry.text.fieldBlock}</span>
        </label>

        {!!p.blockWidth && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>{t.registry.text.blockWidth}</label>
                <input
                  type="number"
                  className={inputCls}
                  value={p.blockWidth}
                  min={1}
                  onChange={(e) => onChange({ blockWidth: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>{t.registry.text.blockLines}</label>
                <input
                  type="number"
                  className={inputCls}
                  value={p.blockLines ?? 1}
                  min={1}
                  onChange={(e) => onChange({ blockLines: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>{t.registry.text.blockJustify}</label>
                <select
                  className={inputCls}
                  value={p.blockJustify ?? 'L'}
                  onChange={(e) => onChange({ blockJustify: e.target.value as TextProps['blockJustify'] })}
                >
                  <option value="L">{t.registry.text.justifyL}</option>
                  <option value="C">{t.registry.text.justifyC}</option>
                  <option value="R">{t.registry.text.justifyR}</option>
                  <option value="J">{t.registry.text.justifyJ}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>{t.registry.text.blockLineSpacing}</label>
                <input
                  type="number"
                  className={inputCls}
                  value={p.blockLineSpacing ?? 0}
                  onChange={(e) => onChange({ blockLineSpacing: Number(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
};
