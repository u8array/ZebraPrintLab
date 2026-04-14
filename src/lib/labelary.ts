import type { LabelConfig } from '../types/ObjectType';

const TIMEOUT_MS = 10_000;

export class LabelaryError extends Error {
  readonly kind: 'api' | 'timeout' | 'network';
  constructor(kind: 'api' | 'timeout' | 'network', message: string) {
    super(message);
    this.name = 'LabelaryError';
    this.kind = kind;
  }
}

export async function fetchPreview(zpl: string, label: LabelConfig): Promise<string> {
  const { dpmm, widthMm, heightMm } = label;
  const widthIn = (widthMm / 25.4).toFixed(3);
  const heightIn = (heightMm / 25.4).toFixed(3);
  const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: zpl,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new LabelaryError('timeout', 'Request timed out.');
    }
    throw new LabelaryError('network', 'Could not reach the Labelary API.');
  }

  if (!res.ok) {
    throw new LabelaryError('api', `Labelary API error: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
