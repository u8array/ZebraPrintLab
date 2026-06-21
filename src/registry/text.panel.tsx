import { useRef, useState, useCallback } from "react";
import type { ObjectTypeUi } from "../types/ObjectType";
import { useT } from "../lib/useT";
import { buttonCls, inputCls, labelCls } from "../components/Properties/styles";
import { getFont, loadFontFile } from "../lib/fontCache";
import { useFontCacheVersion } from "../hooks/useFontCacheVersion";
import { useLabelStore } from "../store/labelStore";
import { RotationSelect } from "../components/Properties/RotationSelect";
import { UnitNumberInput } from "../components/Properties/UnitNumberInput";
import { TemplateContentInput } from "../components/Properties/TemplateContentInput";
import { BlockTextSettings } from "../components/Properties/BlockTextSettings";
import { FpSettings } from "../components/Properties/FpSettings";
import { SectionCard, StaticSectionCard, ToggleSectionCard } from "../components/Properties/SectionCard";
import { FieldLabel, ZplCmd } from "../components/Properties/ZplCmd";
import { Select } from "../components/ui/Select";
import { fontSelectGroups } from "../components/Properties/fontSelectGroups";
import { deriveBlockTextPatch, FB_DEFAULTS } from "../lib/textBlock";
import { fieldGridCols, fieldGridCell } from "../components/ui/formStyles";
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
    const fontGroups = fontSelectGroups(label, t, t.registry.text.useLabelDefault);
    const fontLoaded = !!p.printerFontName && !!getFont(p.printerFontName);
    const fontAssignedButMissing = !!p.printerFontName && !fontLoaded;
    // One "Advanced" reveal for both the legacy font-filename override and
    // the niche ^FP direction/gap (CJK / RTL); auto-open when either is in use.
    const fpInUse = p.fpDirection !== undefined || (p.fpCharGap ?? 0) > 0;
    const [showAdvanced, setShowAdvanced] = useState(!!p.printerFontName || fpInUse);

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
      <>
        <StaticSectionCard title={t.registry.text.content} cmd="^FD">
          <TemplateContentInput
            objectId={obj.id}
            value={p.content}
            onChange={(content) =>
              onChange(deriveBlockTextPatch(content, p, p.fontHeight, p.fontWidth))
            }
          />
        </StaticSectionCard>

        <SectionCard id="text-typography" title={t.properties.typographySection}>
          <div className="flex flex-col gap-1">
            <FieldLabel cmd="^A">{t.registry.text.printerFont}</FieldLabel>
            <Select
              aria-label={t.registry.text.printerFont}
              value={p.fontId ?? ""}
              groups={fontGroups}
              onChange={(v) =>
                onChange({
                  fontId: v || undefined,
                  // Selecting an alias supersedes the legacy filename form.
                  printerFontName: v ? undefined : p.printerFontName,
                })
              }
            />
          </div>

          <div className={`grid grid-cols-2 ${fieldGridCols}`}>
            <UnitNumberInput
              label={t.registry.text.fontHeight}
              valueDots={p.fontHeight}
              minDots={1}
              onChangeDots={(fontHeight) => onChange({ fontHeight })}
              zplCmd="^A"
              className={fieldGridCell}
            />
            <UnitNumberInput
              label={t.registry.text.fontWidth}
              valueDots={p.fontWidth}
              minDots={0}
              onChangeDots={(fontWidth) => onChange({ fontWidth })}
              zplCmd="^A"
              className={fieldGridCell}
            />
          </div>

          <RotationSelect
            value={p.rotation}
            onChange={(rotation) => onChange({ rotation })}
            zplCmd="^A"
          />

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.reverse ?? false}
                onChange={(e) => onChange({ reverse: e.target.checked })}
              />
              <span className={labelCls}>{t.registry.text.reverse}</span>
            </label>
            <ZplCmd cmd="^FR" />
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="text-[10px] text-muted hover:text-text text-left"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced
                ? `▾ ${t.registry.text.fontAdvanced}`
                : `▸ ${t.registry.text.fontAdvanced}`}
            </button>
            {showAdvanced && (
              <div className="flex flex-col gap-2 mt-1 pl-3 border-l border-border">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <label className="text-[10px] text-muted">
                      {t.registry.text.fontFilenameLabel}
                    </label>
                    <ZplCmd cmd="^A@" />
                  </div>
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
                <FpSettings props={p} onChange={onChange} />
              </div>
            )}
          </div>
        </SectionCard>

        {/* The card header switch is the ^FB enable control; the body
            (BlockTextSettings, drag-mode first) shows only while on. */}
        <ToggleSectionCard
          title={t.registry.text.fieldBlock}
          cmd="^FB"
          checked={!!p.blockWidth}
          onCheckedChange={(on) =>
            onChange(
              on
                ? { ...FB_DEFAULTS, blockLines: 3 }
                : {
                    blockWidth: undefined,
                    blockLines: undefined,
                    blockLineSpacing: undefined,
                    blockJustify: undefined,
                  },
            )
          }
        >
          <BlockTextSettings props={p} onChange={onChange} />
        </ToggleSectionCard>
      </>
    );
  },
};
