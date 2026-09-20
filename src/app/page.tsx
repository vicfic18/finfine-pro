'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '@/components/ui/LanguageSelector';
import BrandLogo from '@/components/ui/BrandLogo';

function ArchitecturalCorner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Halftone Stipple Dots Pattern */}
        <pattern id="stippleDotsCorner" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.8" fill="#111215" opacity="0.4" />
        </pattern>
        {/* Fine cross-hatch for rosette vault */}
        <pattern id="vaultCrossHatch" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="4" y2="4" stroke="#111215" strokeWidth="0.4" opacity="0.3" />
          <line x1="4" y1="0" x2="0" y2="4" stroke="#111215" strokeWidth="0.4" opacity="0.3" />
        </pattern>
      </defs>

      {/* Halftone Stipple Dot Fill in Corner Chamfer */}
      <path
        d="M 148 0 L 240 0 L 240 100 L 100 240 L 0 240 L 0 148 L 148 0 Z"
        fill="url(#stippleDotsCorner)"
      />

      {/* Rosette Vault Base Area with Hatching */}
      <path
        d="M 0 0 L 105 0 C 105 58, 58 105, 0 105 Z"
        fill="url(#vaultCrossHatch)"
      />

      {/* Concentric Guilloche Radial Arcs */}
      {[25, 45, 65, 85, 105].map((r) => (
        <path
          key={r}
          d={`M ${r} 0 A ${r} ${r} 0 0 1 0 ${r}`}
          stroke="#111215"
          strokeWidth="0.85"
          strokeOpacity="0.75"
          fill="none"
        />
      ))}

      {/* Fan Vault Radiating Rays / Spokes */}
      {[0, 15, 30, 45, 60, 75, 90].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = 105 * Math.cos(rad);
        const y = 105 * Math.sin(rad);
        return (
          <line
            key={deg}
            x1="0"
            y1="0"
            x2={x.toFixed(2)}
            y2={y.toFixed(2)}
            stroke="#111215"
            strokeWidth="0.8"
            strokeOpacity="0.7"
          />
        );
      })}

      {/* Concentric 45-degree Multi-line Chamfered Border (6 parallel hairline lines) */}
      {[0, 3, 6, 9, 12, 15].map((offset) => {
        const p1 = 120 + offset;
        return (
          <path
            key={offset}
            d={`M ${p1} 0 L 0 ${p1}`}
            stroke="#111215"
            strokeWidth="0.85"
            strokeOpacity={offset === 0 || offset === 15 ? '0.95' : '0.6'}
            fill="none"
          />
        );
      })}

      {/* Connecting Hairlines extending horizontally and vertically */}
      {[0, 3, 6, 9, 12, 15].map((offset) => {
        const p1 = 120 + offset;
        return (
          <g key={`ext-${offset}`}>
            <line
              x1={p1}
              y1="0"
              x2="240"
              y2="0"
              stroke="#111215"
              strokeWidth="0.8"
              strokeOpacity={offset === 0 || offset === 15 ? '0.95' : '0.6'}
            />
            <line
              x1="0"
              y1={p1}
              x2="0"
              y2="240"
              stroke="#111215"
              strokeWidth="0.8"
              strokeOpacity={offset === 0 || offset === 15 ? '0.95' : '0.6'}
            />
          </g>
        );
      })}

      {/* Stepped Inner Frame Lines */}
      <path
        d="M 155 45 L 240 45 M 45 155 L 45 240 M 155 45 L 45 155"
        stroke="#111215"
        strokeWidth="1.2"
        strokeOpacity="0.85"
        fill="none"
      />
      <path
        d="M 160 50 L 240 50 M 50 160 L 50 240 M 160 50 L 50 160"
        stroke="#111215"
        strokeWidth="0.75"
        strokeOpacity="0.45"
        fill="none"
      />
    </svg>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const petalAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  return (
    <div className="relative min-h-screen bg-[#FFFFFF] text-[#111215] flex flex-col justify-between overflow-hidden select-none">
      {/* Recreated Architectural Corner Elements in SVG - Scaled to ~140% */}
      <ArchitecturalCorner className="absolute top-0 left-0 w-44 sm:w-64 md:w-80 lg:w-[340px] pointer-events-none select-none z-0 opacity-80" />
      <ArchitecturalCorner className="absolute top-0 right-0 w-44 sm:w-64 md:w-80 lg:w-[340px] pointer-events-none select-none z-0 opacity-80 -scale-x-100" />
      <ArchitecturalCorner className="absolute bottom-0 left-0 w-44 sm:w-64 md:w-80 lg:w-[340px] pointer-events-none select-none z-0 opacity-80 -scale-y-100" />
      <ArchitecturalCorner className="absolute bottom-0 right-0 w-44 sm:w-64 md:w-80 lg:w-[340px] pointer-events-none select-none z-0 opacity-80 -scale-x-100 -scale-y-100" />

      {/* Ornamental Circles – top half visible at screen top edge (CW), bottom half at screen bottom edge (CCW) */}
      {/* Top circle */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/textures/mone-circle.png"
        alt=""
        aria-hidden="true"
        className="orb-top w-[520px] sm:w-[700px] pointer-events-none select-none mix-blend-multiply z-0"
      />
      {/* Bottom circle */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/textures/mone-circle.png"
        alt=""
        aria-hidden="true"
        className="orb-bottom w-[520px] sm:w-[700px] pointer-events-none select-none mix-blend-multiply z-0"
      />

      {/* Architectural Outer Frame Line */}
      <div className="absolute inset-4 sm:inset-6 border border-neutral-900/15 pointer-events-none z-0">
        <div className="absolute inset-1 border border-neutral-900/10" />
      </div>

      {/* Navbar: FinFine Pro CENTERED, Language & Sign in on RIGHT */}
      <nav className="relative z-30 w-full px-6 sm:px-14 py-6 sm:py-9 flex items-center justify-between">
        {/* Left Spacer for absolute center balance */}
        <div className="flex-1" />

        {/* Center: FinFine Pro with visible radial glow highlight */}
        <div className="relative inline-flex items-center justify-center py-2 px-6">
          {/* Enhanced Radial Glow Highlight */}
          <div
            className="absolute -inset-x-8 -inset-y-4 rounded-full pointer-events-none -z-10 blur-2xl opacity-80"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.45) 0%, rgba(99, 102, 241, 0.3) 45%, rgba(234, 88, 12, 0.15) 70%, transparent 100%)',
            }}
          />
          <BrandLogo size="xl" />
        </div>

        {/* Right: Language Selector + Sign in Button */}
        <div className="flex-1 flex items-center justify-end space-x-3">
          <LanguageSelector variant="compact" />
          <Link
            href="/login"
            className="text-xs sm:text-sm font-sans font-semibold text-neutral-800 hover:text-black px-4 sm:px-5 py-1.5 sm:py-2 rounded-full border border-neutral-300 hover:border-neutral-900 bg-white/80 backdrop-blur-sm transition-all duration-200 shadow-sm cursor-pointer inline-block"
          >
            {t('landing.signIn', 'Sign in')}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 max-w-4xl mx-auto w-full text-center my-auto py-12">
        {/* Sarvam Gateway Style SVG Background with Soft Gradient */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden">
          <svg
            className="w-[460px] sm:w-[640px] h-[460px] sm:h-[640px] animate-gateway-float"
            viewBox="0 0 400 400"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Soft Sarvam Gradient: Periwinkle to Sunset Orange */}
              <linearGradient id="sarvamSoftGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
                <stop offset="40%" stopColor="#818CF8" stopOpacity="0.32" />
                <stop offset="75%" stopColor="#FB923C" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#EA580C" stopOpacity="0.12" />
              </linearGradient>

              {/* Scalloped Halo Gradient */}
              <linearGradient id="scallopOuterHalo" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#818CF8" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FB923C" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            <g transform="translate(200, 200)">
              {/* Outer Scalloped Gateway Portal Contour */}
              <path
                d="M 0 -170 Q 38 -186 65 -152 Q 107 -158 118 -117 Q 158 -107 152 -65 Q 186 -38 170 0 Q 186 38 152 65 Q 158 107 118 117 Q 107 158 65 152 Q 38 186 0 170 Q -38 186 -65 152 Q -107 158 -118 117 Q -158 107 -152 65 Q -186 38 -170 0 Q -186 -38 -152 -65 Q -158 -107 -118 -117 Q -107 -158 -65 -152 Q -38 -186 0 -170 Z"
                stroke="url(#scallopOuterHalo)"
                strokeWidth="1.2"
                fill="none"
              />

              {/* Middle Scalloped Gateway Contour */}
              <path
                d="M 0 -135 Q 30 -148 52 -121 Q 85 -125 94 -93 Q 125 -85 121 -52 Q 148 -30 135 0 Q 148 30 121 52 Q 125 85 94 93 Q 85 125 52 121 Q 30 148 0 135 Q -30 148 -52 121 Q -85 125 -94 93 Q -125 85 -121 52 Q -148 30 -135 0 Q -148 -30 -121 -52 Q -125 -85 -94 -93 Q -85 -125 -52 -121 Q -30 -148 0 -135 Z"
                stroke="url(#scallopOuterHalo)"
                strokeWidth="1"
                fill="none"
              />

              {/* Interlocking 12-petaled Sarvam Gateway Rosette */}
              {petalAngles.map((deg) => (
                <path
                  key={deg}
                  d="M 0 -95 C 32 -55 32 55 0 95 C -32 55 -32 -55 0 -95 Z"
                  transform={`rotate(${deg})`}
                  stroke="url(#sarvamSoftGlow)"
                  strokeWidth="1.3"
                  fill="none"
                />
              ))}

              {/* Inner Central Gateway Diamond */}
              <rect
                x="-10"
                y="-10"
                width="20"
                height="20"
                transform="rotate(45)"
                fill="url(#sarvamSoftGlow)"
                opacity="0.8"
              />
            </g>
          </svg>
        </div>

        {/* Hero Title & Subtitle Container with Subtle White Glowing Background Halo */}
        <div className="relative inline-block mb-8 sm:mb-11 max-w-2xl mx-auto">
          {/* Subtle White Glow Halo covering both Title and Subtitle */}
          <div className="absolute -inset-x-12 sm:-inset-x-24 -inset-y-8 sm:-inset-y-12 bg-white/95 rounded-full blur-2xl pointer-events-none -z-10 shadow-[0_0_80px_rgba(255,255,255,1),0_0_120px_rgba(255,255,255,0.95)]" />

          {/* Headline in PP Cirka */}
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-neutral-900 relative z-10 [text-shadow:0_0_35px_rgba(255,255,255,0.9)] mb-3 sm:mb-4">
            {t('landing.title', 'Cash flow made easy')}
          </h1>

          {/* Subtitle in Gilroy */}
          <p className="font-sans text-base sm:text-lg text-neutral-600 max-w-xl mx-auto relative z-10 font-medium">
            {t('landing.subtitle', 'Helping small businesses make financial decisions, smarter')}
          </p>
        </div>

        {/* Simple Roundish Soft Call to Action Button */}
        <div>
          <Link
            href="/login"
            className="px-10 py-3.5 rounded-full bg-[#111215] text-white font-sans font-bold text-sm tracking-wide shadow-[0_8px_25px_rgba(17,18,21,0.14)] hover:shadow-[0_12px_32px_rgba(17,18,21,0.24)] hover:bg-neutral-800 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer inline-block capitalize"
          >
            {t('landing.start', 'start')}
          </Link>
        </div>
      </main>

      {/* Clean Bottom Spacer for Visual Balance */}
      <footer className="w-full py-5 text-center pointer-events-none" />
    </div>
  );
}

