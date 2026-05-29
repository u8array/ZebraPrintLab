import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls } from "../ui/formStyles";
import {
  PRINTER_LOCALE_VALUES,
  ZPL_MODE_VALUES,
  isPrinterLocale,
  isZplMode,
  type PrinterLocale,
  type ZplMode,
} from "../../types/ObjectType";
import {
  ZplCommandLabel,
  ZplEnumSelect,
  ZplField,
} from "./zplFieldPrimitives";

type LocEncodingLanguage = ReturnType<typeof useT>["printerSettings"]["encodingLanguage"];

/** Explicit value → locale-key maps. Using an object with
 *  `satisfies Record<Enum, keyof LocEncodingLanguage>` instead of a
 *  template-literal helper lets TS catch *both* directions: a new
 *  enum value missing from the map (compile error here) and a key
 *  missing from the locale shape (compile error in the satisfies
 *  clause). The earlier `as`-cast variant bypassed the second
 *  direction. */
const PRINTER_LOCALE_LABEL_KEYS = {
  EN: 'printerLocaleEN', ES: 'printerLocaleES', FR: 'printerLocaleFR',
  DE: 'printerLocaleDE', IT: 'printerLocaleIT', NO: 'printerLocaleNO',
  PT: 'printerLocalePT', SV: 'printerLocaleSV', DK: 'printerLocaleDK',
  SP2: 'printerLocaleSP2', NL: 'printerLocaleNL', FI: 'printerLocaleFI',
  JP: 'printerLocaleJP', KR: 'printerLocaleKR', SC: 'printerLocaleSC',
  TC: 'printerLocaleTC', RU: 'printerLocaleRU', PL: 'printerLocalePL',
  CZ: 'printerLocaleCZ', RO: 'printerLocaleRO', HU: 'printerLocaleHU',
} as const satisfies Record<PrinterLocale, keyof LocEncodingLanguage>;

const ZPL_MODE_LABEL_KEYS = {
  '1': 'zplMode1',
  '2': 'zplMode2',
} as const satisfies Record<ZplMode, keyof LocEncodingLanguage>;

/** Tab 4 of the Printer Settings Modal — encoding & language setup.
 *  All three commands belong to the Setup-Script output channel
 *  (EEPROM-persistent printer state), surfaced under the "Setup
 *  Script" rail group. */
export function EncodingAndLanguageTab() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const loc = t.printerSettings.encodingLanguage;
  const encodingId = useId();

  return (
    <div className="flex flex-col gap-4">
      <ZplEnumSelect
        label={loc.printerLocale}
        command="^KL"
        values={PRINTER_LOCALE_VALUES}
        isValid={isPrinterLocale}
        value={label.printerLocale}
        onChange={(v) => setLabelConfig({ printerLocale: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => `${m} ${loc[PRINTER_LOCALE_LABEL_KEYS[m]]}`}
      />

      {/* ^SE: free-form printer file path (e.g. `E:UHANGUL.DAT`).
          No primitive — datepath-like inputs are not used elsewhere
          in the modal; promote to a primitive only when a second
          caller appears.

          `pattern` is a permissive shape check (drive letter +
          colon + 8-char stem + `.DAT` extension). Includes the
          read-only `Z:` firmware drive; allows lowercase + space +
          underscore + hyphen in the stem (the parser preserves
          path-internal spaces, so blocking them in the UI would
          be inconsistent); strict `.DAT` extension via per-letter
          classes (`[dDaAtT]{3}` would also match `.DDD`); optional
          comma-separated second param (`^SE` accepts one on some
          firmware revisions). Double-escaped backslashes because
          JSX string attributes interpret JS escapes (`\.` would
          collapse to literal `.`, matching any char).

          Acts purely as a visual `:invalid` hint via Tailwind's
          `invalid:` variant; the parser stays tolerant because
          firmware path conventions vary. */}
      <ZplField>
        <ZplCommandLabel text={loc.encodingTable} command="^SE" htmlFor={encodingId} />
        <input
          id={encodingId}
          type="text"
          className={`${inputCls} invalid:border-warning`}
          pattern="[rReEbBaAzZ]:[A-Za-z0-9_\\- ]{1,8}\\.[dD][aA][tT](,.+)?"
          value={label.encodingTable ?? ""}
          onChange={(e) =>
            setLabelConfig({ encodingTable: e.target.value || undefined })
          }
        />
        <span className="font-mono text-[10px] text-muted/70 normal-case tracking-normal">
          {loc.encodingTableHint}
        </span>
      </ZplField>

      <ZplEnumSelect
        label={loc.zplMode}
        command="^SZ"
        values={ZPL_MODE_VALUES}
        isValid={isZplMode}
        value={label.zplMode}
        onChange={(v) => setLabelConfig({ zplMode: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[ZPL_MODE_LABEL_KEYS[m]]}
      />
    </div>
  );
}
