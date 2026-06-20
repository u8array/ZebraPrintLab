import { useState } from "react";
import { BarcodeContentModalShell } from "./BarcodeContentModalShell";
import { useT } from "../../lib/useT";
import { inputCls } from "../ui/formStyles";
import { useLabelStore, useCurrentObjects, getCurrentObjects } from "../../store/labelStore";
import { findObjectById } from "../../types/Group";
import { encodeQr, parseQr, recommendedEc, isQrComplete, QR_TYPES, type QrType, type QrFields } from "../../lib/qrContent";

type FieldKind = "text" | "password" | "textarea" | "checkbox" | "auth";
interface FieldDef {
  key: string;
  labelKey: string;
  kind: FieldKind;
}

// Per-type form fields; `key` matches qrContent field keys, `labelKey` a
// t.qrbuilder.* string. Order = display order.
const FORM_FIELDS: Record<QrType, FieldDef[]> = {
  url: [{ key: "url", labelKey: "fUrl", kind: "text" }],
  text: [{ key: "text", labelKey: "fText", kind: "textarea" }],
  wifi: [
    { key: "ssid", labelKey: "fSsid", kind: "text" },
    { key: "password", labelKey: "fPassword", kind: "password" },
    { key: "auth", labelKey: "fAuth", kind: "auth" },
    { key: "hidden", labelKey: "fHidden", kind: "checkbox" },
  ],
  vcard: [
    { key: "firstName", labelKey: "fFirstName", kind: "text" },
    { key: "lastName", labelKey: "fLastName", kind: "text" },
    { key: "org", labelKey: "fOrg", kind: "text" },
    { key: "title", labelKey: "fTitle", kind: "text" },
    { key: "tel", labelKey: "fTel", kind: "text" },
    { key: "email", labelKey: "fEmail", kind: "text" },
    { key: "url", labelKey: "fUrl", kind: "text" },
  ],
  email: [
    { key: "to", labelKey: "fTo", kind: "text" },
    { key: "subject", labelKey: "fSubject", kind: "text" },
    { key: "body", labelKey: "fBody", kind: "textarea" },
  ],
  tel: [{ key: "number", labelKey: "fNumber", kind: "text" }],
  sms: [
    { key: "number", labelKey: "fNumber", kind: "text" },
    { key: "message", labelKey: "fMessage", kind: "textarea" },
  ],
  geo: [
    { key: "lat", labelKey: "fLat", kind: "text" },
    { key: "lng", labelKey: "fLng", kind: "text" },
  ],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function QrContentModal() {
  const objectId = useLabelStore((s) => s.qrBuilderObjectId);
  if (!objectId) return null;
  // Keyed remount per target so the draft re-seeds from that object.
  return <QrBuilder key={objectId} objectId={objectId} />;
}

function QrBuilder({ objectId }: { objectId: string }) {
  const t = useT();
  const tq = t.qrbuilder;
  const L = (k: string): string => (t.qrbuilder as Record<string, string>)[k] ?? k;
  const closeQrBuilder = useLabelStore((s) => s.closeQrBuilder);
  const updateObject = useLabelStore((s) => s.updateObject);

  // Parse the object's current content once (lazy) to seed the draft.
  const [seed] = useState(() => {
    const obj = findObjectById(getCurrentObjects(), objectId);
    const content = (obj && "props" in obj ? (obj.props as { content?: string }).content : "") ?? "";
    return parseQr(content);
  });
  const [type, setType] = useState<QrType>(seed.type);
  const [byType, setByType] = useState<Record<string, QrFields>>({ [seed.type]: seed.fields });

  const fields = byType[type] ?? {};
  const setField = (key: string, value: string) =>
    setByType((prev) => ({ ...prev, [type]: { ...(prev[type] ?? {}), [key]: value } }));

  const content = encodeQr(type, fields);
  const valid = isQrComplete(type, fields);
  const ec = recommendedEc(content);
  // Hide the "use suggestion" action when EC already matches (no-op undo).
  const objects = useCurrentObjects();
  const currentEc = (() => {
    const o = findObjectById(objects, objectId);
    return o && "props" in o ? (o.props as { errorCorrection?: string }).errorCorrection : undefined;
  })();

  const apply = () => {
    updateObject(objectId, { props: { content } });
    closeQrBuilder();
  };
  const applyEc = () => updateObject(objectId, { props: { errorCorrection: ec } });

  return (
    <BarcodeContentModalShell
      title={tq.title}
      subtitle={tq.subtitle}
      onClose={closeQrBuilder}
      onApply={apply}
      applyDisabled={!valid}
      applyLabel={tq.apply}
      cancelLabel={tq.cancel}
      closeLabel={tq.close}
    >
      <div className="flex flex-wrap gap-1.5">
        {QR_TYPES.map((qt) => (
          <button
            key={qt}
            type="button"
            onClick={() => setType(qt)}
            aria-pressed={qt === type}
            className={`px-2 py-1 rounded text-xs border transition-colors ${
              qt === type ? "border-accent bg-accent-dim text-accent" : "border-border bg-surface-2 hover:bg-border text-text"
            }`}
          >
            {L(`type${cap(qt)}`)}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        {FORM_FIELDS[type].map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            {f.kind === "checkbox" ? (
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={fields[f.key] === "true"}
                  onChange={(e) => setField(f.key, e.target.checked ? "true" : "")}
                />
                {L(f.labelKey)}
              </label>
            ) : (
              <>
                <label className="text-[10px] text-muted" htmlFor={`qr-${f.key}`}>{L(f.labelKey)}</label>
                {f.kind === "textarea" ? (
                  <textarea
                    id={`qr-${f.key}`}
                    className={`${inputCls} resize-y min-h-16`}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                ) : f.kind === "auth" ? (
                  <select
                    id={`qr-${f.key}`}
                    className={inputCls}
                    value={fields[f.key] || "WPA"}
                    onChange={(e) => setField(f.key, e.target.value)}
                  >
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">{tq.fAuthOpen}</option>
                  </select>
                ) : (
                  <input
                    id={`qr-${f.key}`}
                    type={f.kind === "password" ? "password" : "text"}
                    className={inputCls}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </section>

      {valid && (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted">{tq.preview}</span>
            <span className="text-[10px] text-muted">{tq.charsFmt.replace("{n}", String(content.length))}</span>
          </div>
          <code className="text-xs font-mono text-text break-all whitespace-pre-wrap bg-surface-2 rounded px-2 py-1">
            {content}
          </code>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">{tq.ecHintFmt.replace("{ec}", ec)}</span>
            {currentEc !== ec && (
              <button type="button" onClick={applyEc} className="text-[10px] text-accent hover:underline">
                {tq.ecApply.replace("{ec}", ec)}
              </button>
            )}
          </div>
        </section>
      )}
    </BarcodeContentModalShell>
  );
}
