import type { LabelConfig } from '../types/LabelConfig';
const TIMEOUT_MS = 10_000;
const DEFAULT_HOST = 'https://api.labelary.com';

// Build-time Labelary endpoint configuration. Labelary's premium plans
// (Plus, Business, On-Premise) hand out a private hostname; and for the
// metered plans also an API key; via email upon sign-up. Operators set:
//   - VITE_LABELARY_API_URL – e.g. https://acme.labelary.com
//   - VITE_LABELARY_API_KEY – the key value, if the plan requires one
// The key is sent as X-API-Key, matching Labelary's own viewer
// (https://labelary.com/viewer.html source).

function trimmed(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t || undefined;
}

function host(): string {
  const configured = trimmed(import.meta.env.VITE_LABELARY_API_URL);
  if (!configured) return DEFAULT_HOST;
  return configured.replace(/\/+$/, '');
}

function apiKey(): string | undefined {
  return trimmed(import.meta.env.VITE_LABELARY_API_KEY);
}

/** True when the build targets the public api.labelary.com service. UI uses
 *  this to decide whether to surface the third-party-data-leaves-this-app
 *  privacy notice; a custom host implies the operator already controls the
 *  endpoint. */
export function isDefaultLabelaryHost(): boolean {
  return host() === DEFAULT_HOST;
}

class LabelaryError extends Error {
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
  const url = `${host()}/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const key = apiKey();
  if (key) headers['X-API-Key'] = key;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
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

export function labelaryErrorMessage(e: unknown): string {
  if (e instanceof LabelaryError) {
    if (e.kind === 'api') return 'Labelary returned an error. Check that the label dimensions and dpmm are valid.';
    if (e.kind === 'timeout') return 'Labelary did not respond in time.';
  }
  return 'Could not reach the Labelary preview service. Check your network connection.';
}
