import { useLabelStore } from '../store/labelStore';
import type { Translations } from '../locales';

export function useT(): Translations {
  return useLabelStore((s) => s.translations);
}
