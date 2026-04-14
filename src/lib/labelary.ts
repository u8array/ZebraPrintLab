import type { LabelConfig } from '../types/ObjectType';

export async function fetchPreview(
  zpl: string,
  label: LabelConfig
): Promise<string> {
  const { dpmm, widthMm, heightMm } = label;
  const widthIn = (widthMm / 25.4).toFixed(3);
  const heightIn = (heightMm / 25.4).toFixed(3);

  const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: zpl,
  });

  if (!res.ok) throw new Error(`Labelary API error: ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
