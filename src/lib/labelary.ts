import type { LabelConfig } from '@zplab/core/types/LabelConfig';
const TIMEOUT_MS = 10_000;
const DEFAULT_HOST = 'https://api.labelary.com';

// Runtime host/key (from the store) fall back to the build env. Vite inlines
// VITE_* into the public bundle, so never set the key variable for a published
// build. The key is sent as X-API-Key, matching Labelary's own viewer.

function trimmed(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t || undefined;
}

/** Effective host: runtime setting, else build env, else the public service.
 *  Trailing slashes trimmed so the path join stays clean. */
export function resolveHost(runtimeHost: string): string {
  const configured = trimmed(runtimeHost) ?? trimmed(import.meta.env.VITE_LABELARY_API_URL);
  if (!configured) return DEFAULT_HOST;
  return configured.replace(/\/+$/, '');
}

/** Effective key: runtime setting, else build env, else none. */
export function resolveApiKey(runtimeKey: string): string | undefined {
  return trimmed(runtimeKey) ?? trimmed(import.meta.env.VITE_LABELARY_API_KEY);
}

/** True when the effective host is the public api.labelary.com. UI uses this
 *  to gate the third-party-data-leaves-this-app privacy notice; a custom host
 *  implies the operator already controls the endpoint. */
export function isDefaultHost(runtimeHost: string): boolean {
  return resolveHost(runtimeHost) === DEFAULT_HOST;
}

class LabelaryError extends Error {
  readonly kind: 'api' | 'timeout' | 'network';
  constructor(kind: 'api' | 'timeout' | 'network', message: string) {
    super(message);
    this.name = 'LabelaryError';
    this.kind = kind;
  }
}

export async function fetchPreview(
  zpl: string,
  label: LabelConfig,
  host: string,
  apiKey?: string,
): Promise<string> {
  const { dpmm, widthMm, heightMm } = label;
  const widthIn = (widthMm / 25.4).toFixed(3);
  const heightIn = (heightMm / 25.4).toFixed(3);
  const url = `${host}/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (apiKey) headers['X-API-Key'] = apiKey;

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
