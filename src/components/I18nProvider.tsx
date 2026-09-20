'use client';

import React, { useEffect } from 'react';
import i18n, { getSavedLanguage, setAppLanguage, type LanguageCode } from '@/lib/i18n';
import { I18nextProvider } from 'react-i18next';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = getSavedLanguage();
    if (i18n.language !== saved) {
      setAppLanguage(saved);
    }
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
