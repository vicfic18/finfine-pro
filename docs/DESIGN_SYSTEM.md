# FinFine Pro design system

This document records the visual conventions that are actually implemented in
`src/app/globals.css`, the App Router pages, and the shared UI components. It is
a lightweight code-aligned guide, not a separate token package.

## Product character

FinFine combines a warm editorial surface with precise financial telemetry:

- architectural linework and gateway motifs on the landing and onboarding
  surfaces;
- high-contrast, paper-like content areas for forms and document review;
- dark metric pods for cash runway, forecasts, and dense quantitative context;
- rigid borders, compact labels, tabular numbers, and restrained motion; and
- multilingual UI copy with English as the fallback.

The design is light-first. The dashboard uses white cards over a pale neutral
background with a subdued texture; dark surfaces are reserved for emphasis.

## Foundations

### Color tokens

The CSS variables in `src/app/globals.css` are the canonical values.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#FBF9F5` | Warm application canvas for onboarding and document surfaces. |
| `--foreground` | `#111215` | Primary ink and headings. |
| `--card` | `#FFFFFF` | Cards and form surfaces. |
| `--secondary` | `#F4F0E8` | Stone surfaces and onboarding rail. |
| `--muted` | `#EFEAE1` | Inactive or secondary fills. |
| `--muted-foreground` | `#71717A` | Metadata and helper text. |
| `--border` | `#E5E0D6` | Default hairline borders. |
| `--input` | `#D8D1C4` | Input outlines. |
| `--ring` | `#E85D25` | Focus and terracotta interaction accent. |
| `--finfine-terracotta` | `#E85D25` | Primary accent and active upload state. |
| `--finfine-gold` | `#D97706` | Warnings and statutory attention. |
| `--finfine-emerald` | `#059669` | Healthy, confirmed, or protected state. |
| `--finfine-dark-pod` | `#111317` | Forecast and telemetry modules. |

The dashboard also uses Tailwind neutral/emerald/orange classes directly. Keep
new feature colors close to the existing neutral, terracotta, gold, emerald,
and crimson vocabulary rather than introducing an unrelated palette.

### Typography

`globals.css` registers local fonts from `src/app/fonts/`:

| Role | Font | Weights / examples |
| --- | --- | --- |
| Display | PP Cirka | 400 and 700; page titles, section headings, hero copy. |
| Interface | Gilroy | 600 and 700; labels, controls, body UI, navigation. |
| Telemetry | System monospace utilities | Currency, dates, IDs, status labels, compact metrics. |

The reusable classes are `.font-display` and `.font-sans`; the CSS variables
are `--font-cirka` and `--font-gilroy`. Use `font-mono` or an explicit
monospace stack for values that must align numerically.

### Geometry and depth

- Prefer 1px neutral borders and rectangular or gently rounded surfaces.
- Use solid offset shadows for primary onboarding actions and selected controls
  (`3px–7px` offsets), not diffuse shadows as the main affordance.
- Use uppercase monospace micro-labels with increased letter spacing for
  sections, statuses, and telemetry metadata.
- Use `tabular-nums` for money, counts, and days so columns remain stable.
- Preserve visible focus rings; the onboarding inputs and dropzone use
  terracotta focus treatments.

## Page-level patterns

### Landing and authentication

`src/app/page.tsx` and `src/app/login/page.tsx` use a white canvas, centered
FinFine branding, architectural SVG corners, the `mone-circle.png` ornamental
asset, and PP Cirka display headlines. The landing page uses a soft indigo-to-
orange gateway illustration and a pill-shaped sign-in/start action. Keep
decorative SVGs `aria-hidden` when they do not convey content.

### Onboarding

The onboarding shell is a responsive three-part layout on wide screens:

1. a stone progress rail;
2. an architectural visual panel; and
3. a white form surface with fixed actions on small screens.

The class family is `onboarding-*` in `globals.css`. Form controls are compact,
square-cornered, and show a terracotta border plus offset shadow on focus. File
dropzones use a dashed border and an active terracotta state. Readiness and
attestation cards use dark pods with emerald or gold status accents.

### Dashboard shell

`src/app/dashboard/layout.tsx` provides:

- a narrow desktop icon rail with tooltip labels;
- a mobile bottom bar with four primary items and a More drawer;
- a neutral `#f4f5f7` main surface with the Mone texture at low opacity; and
- consistent spacing through Tailwind utilities.

The navigation order is Dashboard, Documents, Chat, Obligations, Predictions,
Tax Compliance, and Settings. `LanguageSelector` is available in the rail and
mobile menu.

### Dashboard content

The dashboard uses a bordered white editorial grid. The primary metric row
contains total liquid cash, spendable cash, cash runway, and operating
velocity. Forecast charts, commitments, and risk/calendar modules follow the
same border/divider rhythm. Use dark backgrounds for dense prediction context
and white/neutral cards for lists and editable data.

### Documents and review

The document page uses the `documents-*` class family, category tabs, a compact
upload card, grouped history rows, status chips, and expandable review panels.
Validation issues use gold/orange; successful processing uses emerald; errors
use crimson. Corrections should remain visually separate from extracted values,
matching the append-only confirmation model.

## Component conventions

Shared components worth reusing before adding new patterns include:

- `BrandLogo` for FinFine wordmarks and size variants;
- `LanguageSelector` for the four supported UI languages;
- `FinFineProLoader` for loading states;
- `Tooltip` primitives for desktop icon navigation;
- `DocumentUploadZone`, `DocumentReview`, and `PdfDropzone` for document flows;
- `ForecastingCharts`, `RiskCalendar`, and dashboard widgets for metrics; and
- `OnboardingShell`, `StepHeader`, and the onboarding field/card classes for
  multi-step forms.

Prefer composing these primitives and existing Tailwind utilities over adding a
new global CSS abstraction for one screen.

## Motion and interaction

Implemented motion is CSS-based and includes:

- `animate-gateway-float` for the landing gateway illustration;
- ornamental top/bottom circle entry and spin animations;
- chart line/area reveal animations; and
- loader word-reveal/slide-away sequences.

Onboarding controls use short transitions for border, shadow, opacity, and
translation. Use `prefers-reduced-motion` for new non-essential motion; the
existing onboarding rules already disable its transitions under that media
query. Never make animation the only indicator of processing or status.

## Internationalization

`src/lib/i18n/index.ts` registers:

| Code | Language |
| --- | --- |
| `en` | English |
| `hi` | Hindi |
| `ta` | Tamil |
| `ml` | Malayalam |

English is the fallback. The selected language is stored in browser
`localStorage` under `finfine_language`, and the document `lang` attribute is
updated. New user-facing strings should be added to all locale files or given a
clear English fallback through `t(key, fallback)`.

## Accessibility and responsive behavior

- Use semantic headings and `aria-label` values for icon-only controls.
- Preserve keyboard focus styles and visible button disabled states.
- Do not rely on color alone for document/forecast status; include text or an
  icon label.
- Keep dropzones and dialogs operable by keyboard, with clear focus targets.
- Follow the existing breakpoints: the desktop sidebar collapses into a mobile
  bottom bar, onboarding hides the visual panel below 1,080px, and form grids
  become one column below 700px.
- Use local font files and CSS animation rather than introducing a heavy motion
  dependency for simple transitions.

## Implementation references

- Global tokens, fonts, component classes, and keyframes: `src/app/globals.css`
- Landing: `src/app/page.tsx`
- Authentication: `src/app/login/page.tsx`
- Onboarding: `src/components/onboarding/`
- Dashboard shell: `src/app/dashboard/layout.tsx`
- Dashboard widgets: `src/components/dashboard/`
- Document UI: `src/components/ingestion/`
- Localized strings: `src/lib/i18n/locales/`
