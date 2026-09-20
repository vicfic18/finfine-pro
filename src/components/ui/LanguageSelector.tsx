'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/lib/i18n';
import clsx from 'clsx';

interface LanguageSelectorProps {
  variant?: 'compact' | 'full' | 'pills';
  placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}

export default function LanguageSelector({
  variant = 'compact',
  placement = 'top-right',
  className,
}: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLangCode = (i18n.language || 'en') as LanguageCode;
  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLangCode) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLanguage = async (code: LanguageCode) => {
    await setAppLanguage(code);
    setIsOpen(false);
  };

  // 1. Pills Variant (Great for Settings or Onboarding)
  if (variant === 'pills') {
    return (
      <div className={clsx('grid grid-cols-2 sm:grid-cols-4 gap-2.5', className)}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = currentLang.code === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelectLanguage(lang.code)}
              className={clsx(
                'flex items-center justify-between p-3 border transition-all text-left cursor-pointer',
                isSelected
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-100'
              )}
            >
              <div>
                <span className="font-bold text-sm block font-sans">{lang.nativeName}</span>
                <span
                  className={clsx(
                    'text-[11px] block',
                    isSelected ? 'text-neutral-300' : 'text-neutral-500'
                  )}
                >
                  {lang.name}
                </span>
              </div>
              {isSelected && <Check size={16} className="text-white shrink-0 ml-2" />}
            </button>
          );
        })}
      </div>
    );
  }

  // 2. Compact / Dropdown Variant (Icon-only trigger)
  return (
    <div className={clsx('relative inline-block text-left font-sans', className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-200 shadow-2xs cursor-pointer',
          isOpen
            ? 'border-neutral-900 bg-neutral-100 text-neutral-900'
            : 'border-neutral-300 hover:border-neutral-900 bg-white/90 text-neutral-700 hover:text-neutral-900 backdrop-blur-xs'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Change Language (${currentLang.name})`}
        title={`Change Language (${currentLang.name})`}
      >
        <Globe size={18} className="shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={clsx(
            'absolute w-48 bg-white border border-neutral-200 shadow-xl rounded-xl py-1 z-50 animate-fadeIn divide-y divide-neutral-100',
            placement === 'top-right' && 'bottom-full left-0 mb-2',
            placement === 'top-left' && 'bottom-full right-0 mb-2',
            placement === 'bottom-right' && 'top-full left-0 mt-2',
            placement === 'bottom-left' && 'top-full right-0 mt-2'
          )}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Select Language
          </div>
          <div className="py-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = currentLang.code === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelectLanguage(lang.code)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors text-left cursor-pointer',
                    isSelected
                      ? 'bg-neutral-100 text-neutral-900 font-bold'
                      : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                  )}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded bg-neutral-100 border border-neutral-200 text-[10px] font-bold text-neutral-600 flex items-center justify-center shrink-0">
                      {lang.scriptBadge}
                    </span>
                    <div>
                      <span className="block leading-tight font-medium">{lang.nativeName}</span>
                      <span className="text-[10px] text-neutral-400 block">{lang.name}</span>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-neutral-900 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
