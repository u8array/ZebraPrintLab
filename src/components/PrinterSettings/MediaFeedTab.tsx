import { useT } from "../../lib/useT";
import { useLabelStore } from "../../store/labelStore";
import { BACKFEED_SEQUENCE_VALUES, MAX_LABEL_LENGTH_RANGE, MEDIA_FEED_VALUES, MEDIA_MODE_VALUES, MEDIA_TRACKING_VALUES, MEDIA_TYPE_VALUES, type BackfeedSequence, type MediaFeedMode, type MediaMode, type MediaTracking, type MediaType } from "../../types/LabelConfig";
import {
  ZplBoundedIntInput,
  ZplCheckbox,
  ZplCommandLabel,
  ZplEnumCustomSelect,
  ZplEnumSubCustomSelect,
  ZplField,
} from "./zplFieldPrimitives";

type LocMediaFeed = ReturnType<typeof useT>["printerSettings"]["mediaFeed"];

/** Static lookup table from enum value to the locale-key that
 *  describes it. Compile-time check via `satisfies` guarantees
 *  every enum value has a matching key and every key actually
 *  exists on the locale block, so a missing translation surfaces
 *  as a TS error rather than `undefined` at runtime. */
const TRACKING_LABEL_KEYS = {
  N: "mediaTrackingN",
  Y: "mediaTrackingY",
  W: "mediaTrackingW",
  M: "mediaTrackingM",
  A: "mediaTrackingA",
} as const satisfies Record<MediaTracking, keyof LocMediaFeed>;

const FEED_LABEL_KEYS = {
  F: "mediaFeedF",
  C: "mediaFeedC",
  L: "mediaFeedL",
  N: "mediaFeedN",
  S: "mediaFeedS",
} as const satisfies Record<MediaFeedMode, keyof LocMediaFeed>;

const MEDIA_MODE_LABEL_KEYS = {
  T: "mediaModeT",
  V: "mediaModeV",
  D: "mediaModeD",
  K: "mediaModeK",
} as const satisfies Record<MediaMode, keyof LocMediaFeed>;

const MEDIA_TYPE_LABEL_KEYS = {
  T: "mediaTypeT",
  D: "mediaTypeD",
} as const satisfies Record<MediaType, keyof LocMediaFeed>;

const BACKFEED_LABEL_KEYS = {
  A: "backfeedSeqA",
  B: "backfeedSeqB",
  N: "backfeedSeqN",
  O: "backfeedSeqO",
} as const satisfies Record<BackfeedSequence, keyof LocMediaFeed>;

/** Tab 1 of the Printer Settings Modal. All fields write to the
 *  shared `labelConfig` store; the ZPL generator emits the
 *  corresponding ^MM / ^MT / ^MN / ^ML / ^MF / ^XB commands in
 *  the per-label header section. */
export function MediaFeedTab() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const loc = t.printerSettings.mediaFeed;

  return (
    <div className="flex flex-col gap-4">
      <ZplEnumCustomSelect
        label={loc.mediaMode}
        command="^MM"
        values={MEDIA_MODE_VALUES}
        value={label.mediaMode}
        onChange={(v) => setLabelConfig({ mediaMode: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[MEDIA_MODE_LABEL_KEYS[m]]}
      />

      <ZplEnumCustomSelect
        label={loc.mediaType}
        command="^MT"
        values={MEDIA_TYPE_VALUES}
        value={label.mediaType}
        onChange={(v) => setLabelConfig({ mediaType: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[MEDIA_TYPE_LABEL_KEYS[m]]}
      />

      <ZplEnumCustomSelect
        label={loc.mediaTracking}
        command="^MN"
        values={MEDIA_TRACKING_VALUES}
        value={label.mediaTracking}
        onChange={(v) => setLabelConfig({ mediaTracking: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[TRACKING_LABEL_KEYS[m]]}
      />

      <ZplBoundedIntInput
        label={loc.maxLabelLength}
        command="^ML"
        min={MAX_LABEL_LENGTH_RANGE.min}
        max={MAX_LABEL_LENGTH_RANGE.max}
        value={label.maxLabelLength}
        onChange={(v) => setLabelConfig({ maxLabelLength: v })}
        unit={t.printerSettings.dotsUnit}
      />

      {/* ^MF carries two positional params, so the row's "control"
          slot is a 2-col grid instead of a single input. Both
          sub-selects share one ZPL command tag and one heading;
          ZplSubField gives each slot its own <label> while the
          parent ZplField carries the ^MF tag. */}
      <ZplField>
        <ZplCommandLabel text={loc.mediaFeedHeading} command="^MF" />
        <div className="grid grid-cols-2 gap-2">
          <ZplEnumSubCustomSelect
            label={loc.mediaFeedPowerUp}
            values={MEDIA_FEED_VALUES}
            value={label.mediaFeedPowerUp}
            onChange={(v) => setLabelConfig({ mediaFeedPowerUp: v })}
            defaultLabel={t.printerSettings.defaultOption}
            optionLabel={(m) => loc[FEED_LABEL_KEYS[m]]}
          />
          <ZplEnumSubCustomSelect
            label={loc.mediaFeedHeadClose}
            values={MEDIA_FEED_VALUES}
            value={label.mediaFeedHeadClose}
            onChange={(v) => setLabelConfig({ mediaFeedHeadClose: v })}
            defaultLabel={t.printerSettings.defaultOption}
            optionLabel={(m) => loc[FEED_LABEL_KEYS[m]]}
          />
        </div>
      </ZplField>

      <ZplCheckbox
        text={loc.suppressBackfeed}
        command="^XB"
        checked={!!label.suppressBackfeed}
        onChange={(v) => setLabelConfig({ suppressBackfeed: v ? true : undefined })}
      />

      <ZplEnumCustomSelect
        label={loc.backfeedSequence}
        command="~JS"
        values={BACKFEED_SEQUENCE_VALUES}
        value={label.backfeedSequence}
        onChange={(v) => setLabelConfig({ backfeedSequence: v })}
        defaultLabel={t.printerSettings.defaultOption}
        optionLabel={(m) => loc[BACKFEED_LABEL_KEYS[m]]}
      />
    </div>
  );
}

