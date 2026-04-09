/**
 * All available locales.
 *
 * Migration path to i18next:
 *   1. pnpm add i18next react-i18next
 *   2. import i18n from 'i18next'; import { initReactI18next } from 'react-i18next';
 *   3. i18n.use(initReactI18next).init({ resources: locales, lng: 'en', fallbackLng: 'en' })
 *   4. Replace `import t from '../../locales/en'` → `const { t } = useTranslation()`
 *   5. Replace `t.some.key` → `t('some.key')`
 */
import en from './en';
import de from './de';
import fr from './fr';
import es from './es';
import pt from './pt';
import it from './it';
import nl from './nl';
import pl from './pl';
import cs from './cs';
import sk from './sk';
import hu from './hu';
import ro from './ro';
import sv from './sv';
import no from './no';
import da from './da';
import fi from './fi';
import el from './el';
import bg from './bg';
import hr from './hr';
import sr from './sr';
import sl from './sl';
import et from './et';
import lv from './lv';
import lt from './lt';
import ar from './ar';
import he from './he';
import fa from './fa';
import tr from './tr';
import zhHans from './zh-hans';
import zhHant from './zh-hant';
import ja from './ja';
import ko from './ko';

export const locales = {
  en,
  de,
  fr,
  es,
  pt,
  it,
  nl,
  pl,
  cs,
  sk,
  hu,
  ro,
  sv,
  no,
  da,
  fi,
  el,
  bg,
  hr,
  sr,
  sl,
  et,
  lv,
  lt,
  ar,
  he,
  fa,
  tr,
  'zh-hans': zhHans,
  'zh-hant': zhHant,
  ja,
  ko,
} as const;

export type LocaleCode = keyof typeof locales;

export const localeNames: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  sv: 'Svenska',
  no: 'Norsk',
  da: 'Dansk',
  fi: 'Suomi',
  el: 'Ελληνικά',
  bg: 'Български',
  hr: 'Hrvatski',
  sr: 'Srpski',
  sl: 'Slovenščina',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  ar: 'العربية',
  he: 'עברית',
  fa: 'فارسی',
  tr: 'Türkçe',
  'zh-hans': '中文 (简体)',
  'zh-hant': '中文 (繁體)',
  ja: '日本語',
  ko: '한국어',
};

export default locales;
