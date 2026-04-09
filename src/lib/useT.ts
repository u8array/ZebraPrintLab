import { useLabelStore } from '../store/labelStore';
import { locales } from '../locales';

export function useT() {
  const locale = useLabelStore((s) => s.locale);
  return locales[locale];
}
