import { useRef, useState, useCallback } from "react";
import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { buttonCls, inputCls, labelCls } from "../components/Properties/styles";
import { getFont, loadFontFile } from "../lib/fontCache";
import { getAvailableFontIds, stripDrivePrefix } from "../lib/customFonts";
import { useFontCacheVersion } from "../hooks/useFontCacheVersion";
import { useLabelStore } from "../store/labelStore";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { NumberInput } from "../components/Properties/NumberInput";
import { TemplateContentInput } from "../components/Properties/TemplateContentInput";
import { BlockTextSettings } from "../components/Properties/BlockTextSettings";
import { FpSettings } from "../components/Properties/FpSettings";
import { deriveBlockTextPatch, FB_DEFAULTS } from "../lib/textBlock";
import type { TextProps } from "./text";

export const textPanel: ObjectTypeUi<TextProps> = {
  PropertiesPanel: ({ obj, onChange }) => {
    const t = useT();
    const p = obj.props;
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    useFontCacheVersion();
    const label = useLabelStore((s) => s.label);

    // Font picker options: every alias the user can reference from this
    // field, in this order; "(use label default)" → built-ins (0, A-H)
    // → custom ^CW aliases. The selected fontId pins a specific ID on
    // the field via the ^A{id} short form. The legacy filename-based
    // override (printerFontName, ^A@…E:NAME.TTF) lives behind the
    // advanced reveal because round-trip-imported labels still rely on
    // it, but the alias dropdown covers every fresh design.
    const fontIdOptions = getAvailableFontIds(label);
    const fontLoaded = !!p.printerFontName && !!getFont(p.printerFontName);
    const fontAssignedButMissing = !!p.printerFontName && !fontLoaded;
    const [showAdvanced, setShowAdvanced] = useState(!!p.printerFontName);
    // Niche (CJK / RTL); auto-expand only when already in use.
    const fpInUse = p.fpDirection !== undefined || (p.fpCharGap ?? 0) > 0;
    const [showFp, setShowFp] = useState(fpInUse);

    const handleFontUpload = useCallback(
      async (file: File) => {
        if (!p.printerFontName) return;
        setUploading(true);
        try {
          await loadFontFile(file, p.printerFontName);
        } finally {
          setUploading(false);
        }
      },
      [p.printerFontName],
    );

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.printerFont}</label>
          <select
            className={inputCls}
            value={p.fontId ?? ""}
            onChange={(e) =>
              onChange({
                fontId: e.target.value || undefined,
                // Selecting an alias supersedes the legacy filename form.
                printerFontName: e.target.value ? undefined : p.printerFontName,
              })
            }
          >
            <option value="">{t.registry.text.useLabelDefault}</option>
            {fontIdOptions.map((opt) => {
              const previewName =
                opt.previewFontName ??
                (opt.path ? stripDrivePrefix(opt.path) : undefined);
              const suffix = previewName
                ? ` — ${previewName}`
                : opt.builtin
                  ? `  ${t.registry.text.builtinSuffix}`
                  : "";
              return (
                <option key={opt.id} value={opt.id}>
                  {opt.id}
                  {suffix}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="text-[10px] text-muted hover:text-text text-left mt-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? `▾ ${t.registry.text.fontAdvanced}`
              : `▸ ${t.registry.text.fontAdvanced}`}
          </button>
          {showAdvanced && (
            <div className="flex flex-col gap-1 mt-1 pl-3 border-l border-border">
              <label className="text-[10px] text-muted">
                {t.registry.text.fontFilenameLabel}
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="ARIAL.TTF"
                value={p.printerFontName ?? ""}
                onChange={(e) =>
                  onChange({
                    printerFontName: e.target.value || undefined,
                    fontId: e.target.value ? undefined : p.fontId,
                  })
                }
              />
              {fontLoaded && (
                <span className="text-[10px] text-accent font-mono">
                  {t.registry.text.fontLoaded}
                </span>
              )}
              {fontAssignedButMissing && (
                <>
                  <span className="text-[10px] text-muted font-mono">
                    {t.registry.text.fontMissing}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".ttf,.otf,.TTF,.OTF"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFontUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={buttonCls}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading
                      ? t.registry.text.uploadingFont
                      : t.registry.text.uploadFont}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{t.registry.text.content}</label>
          <TemplateContentInput
            objectId={obj.id}
            value={p.content}
            onChange={(content) =>
              onChange(deriveBlockTextPatch(content, p, p.fontHeight, p.fontWidth))
            }
          />
        </div>

        {/* Block-Text settings sit directly under the content editor
            because they govern how that content renders (wrap width,
            max lines, justify); keeping them adjacent makes the
            cause/effect relationship obvious. Other settings (font,
            rotation, reverse) act on the whole field and come below. */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!p.blockWidth}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { ...FB_DEFAULTS, blockLines: 3 }
                  : {
                      blockWidth: undefined,
                      blockLines: undefined,
                      blockLineSpacing: undefined,
                      blockJustify: undefined,
                    },
              )
            }
          />
          <span className={labelCls}>{t.registry.text.fieldBlock}</span>
        </label>

        {!!p.blockWidth && <BlockTextSettings props={p} onChange={onChange} />}

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={t.registry.text.fontHeight}
            value={p.fontHeight}
            min={1}
            onChange={(fontHeight) => onChange({ fontHeight })}
          />
          <NumberInput
            label={t.registry.text.fontWidth}
            value={p.fontWidth}
            min={0}
            onChange={(fontWidth) => onChange({ fontWidth })}
          />
        </div>

        <RotationSelect
          value={p.rotation}
          onChange={(rotation) => onChange({ rotation })}
        />

        {/* ^FP sits next to Rotation: both govern glyph flow rather
            than what is painted. */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="text-[10px] text-muted hover:text-text text-left"
            onClick={() => setShowFp((v) => !v)}
            aria-expanded={showFp}
          >
            {showFp
              ? `▾ ${t.registry.text.fpAdvanced}`
              : `▸ ${t.registry.text.fpAdvanced}`}
          </button>
          {showFp && <FpSettings props={p} onChange={onChange} />}
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
      </div>
    );
  },
};
