import { useId } from "react";
import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { inputCls, labelCls } from "../ui/formStyles";
import { PRINTER_NAME_MAX_LEN } from "../../types/ObjectType";
import {
  ZplCommandLabel,
  ZplField,
  ZplSubField,
} from "./zplFieldPrimitives";

/** Tab 5 of the Printer Settings Modal — printer identity setup.
 *  Emits ^KN (printer name + description) on the Setup-Script
 *  channel; both fields fold into a single `^KNname,description`
 *  command at emit time. The tab stays intentionally focused on
 *  "what is this printer called" — ^SL (clock-formatting Mode +
 *  Language) lives in Tab 3 Clock & Time per its semantic home.
 *  See memory:project_ticket_sl_clock_formatting for the ^SL
 *  follow-up. */
export function IdentityTab() {
  const t = useT();
  const profile = useLabelStore((s) => s.printerProfile);
  const patchPrinterProfile = useLabelStore((s) => s.patchPrinterProfile);
  const loc = t.printerSettings.identity;
  const nameId = useId();

  return (
    <div className="flex flex-col gap-4">
      {/* Both inputs fold into one ^KN emit. The tag sits on the
          parent ZplField only; the description uses ZplSubField
          to share the tag instead of duplicating it (same pattern
          as ^PR triple in PrintQualityTab and ^MF pair in
          MediaFeedTab). */}
      <ZplField>
        <ZplCommandLabel text={loc.printerName} command="^KN" htmlFor={nameId} />
        <input
          id={nameId}
          type="text"
          maxLength={PRINTER_NAME_MAX_LEN}
          className={inputCls}
          value={profile.printerName ?? ""}
          onChange={(e) =>
            patchPrinterProfile({ printerName: e.target.value || undefined })
          }
        />
        <span className={`${labelCls} normal-case tracking-normal text-muted/70`}>
          {loc.printerNameHint}
        </span>

        <ZplSubField label={loc.printerDescription}>
          {(id) => (
            <input
              id={id}
              type="text"
              className={inputCls}
              value={profile.printerDescription ?? ""}
              onChange={(e) =>
                patchPrinterProfile({ printerDescription: e.target.value || undefined })
              }
            />
          )}
        </ZplSubField>
      </ZplField>
    </div>
  );
}
