import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { hi } from './locales/hi';
import { ta } from './locales/ta';
import { ml } from './locales/ml';

export type LanguageCode = 'en' | 'hi' | 'ta' | 'ml';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  scriptBadge: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    scriptBadge: 'EN',
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    scriptBadge: 'हिं',
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    scriptBadge: 'தமி',
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    scriptBadge: 'മല',
  },
];

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
  ml: { translation: ml },
} as const;

const STORAGE_KEY = 'finfine_language';

// Helper to safely get stored language
export function getSavedLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && ['en', 'hi', 'ta', 'ml'].includes(saved)) {
        return saved;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
  }
  return 'en';
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: 'en', // default, will be synced by provider on client
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export async function setAppLanguage(lang: LanguageCode) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      // ignore storage error
    }
  }
  await i18n.changeLanguage(lang);
  // Dispatch a custom event so non-React components or listeners can react if needed
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('finfine:languageChanged', { detail: { lang } }));
  }
}

export default i18n;
