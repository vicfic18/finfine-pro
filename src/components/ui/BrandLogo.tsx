'use client';

import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * BrandLogo
 *
 * Render "FinFine Pro" in the exact logo typography style as defined in FinFineProLoader:
 * - "Fin": font-display font-bold text-neutral-900
 * - "Fine": font-display font-bold text-neutral-900
 * - "Pro": font-sans font-semibold text-neutral-400 (subtly lighter, slightly scaled)
 */
export default function BrandLogo({ className = '', size = 'sm' }: BrandLogoProps) {
  const sizeClasses = {
    sm: {
      main: 'text-sm sm:text-base',
      pro: 'text-xs sm:text-sm',
    },
    md: {
      main: 'text-xl sm:text-2xl',
      pro: 'text-base sm:text-lg',
    },
    lg: {
      main: 'text-4xl sm:text-5xl',
      pro: 'text-2xl sm:text-3xl',
    },
  }[size];

  return (
    <span className={`inline-flex items-baseline gap-[0.18em] select-none ${className}`}>
      <span className={`font-display font-bold tracking-tight text-neutral-900 ${sizeClasses.main}`}>
        Fin
      </span>
      <span className={`font-display font-bold tracking-tight text-neutral-900 ${sizeClasses.main}`}>
        Fine
      </span>
      <span className={`font-sans font-semibold tracking-tight text-neutral-400 ${sizeClasses.pro}`}>
        Pro
      </span>
    </span>
  );
}
