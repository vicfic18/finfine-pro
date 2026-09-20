/**
 * Indian Financial Calendar & Covariate Engine
 * 
 * Provides dynamic Indian market domain intelligence for cash flow forecasting:
 * - Dynamic Indian festivals and shopping periods from database
 * - Dynamic statutory tax deadlines matched to merchant business classification
 * - Indian banking settlement friction (2nd/4th Saturdays, bank holidays)
 */

import {
  MarketCalendarEvent,
  TaxComplianceRule,
  AUTHORITATIVE_TAX_RULES_CATALOG,
  AUTHORITATIVE_MARKET_EVENTS_CATALOG,
} from './tax-rules-engine';

export interface IndianFestivalEvent {
  name: string;
  category: 'FESTIVAL_PEAK' | 'MEGA_SALE' | 'STATUTORY_DEADLINE' | 'SETTLEMENT_HOLD';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  inflowMultiplier: number;  // Multiplier for expected consumer UPI collections
  outflowUplift: number;     // Expected inventory restocking outflow before event
  description: string;
}

export interface IndianDateContext {
  date: string;
  isFestivalActive: boolean;
  activeFestivals: string[];
  inflowMultiplier: number;
  isStatutoryDrainDay: boolean;
  statutoryObligationName?: string;
  statutoryCategory?: string;
  isBankSettlementDelayed: boolean; // 2nd/4th Sat or Sun
  dayOfWeek: number;
}

export interface IndianCalendarMilestone {
  date: string;
  dayOffset: number;
  type: 'FESTIVAL' | 'MEGA_SALE' | 'STATUTORY_TAX';
  title: string;
  expectedImpact: string;
  recommendedAction: string;
}

export interface IndianCalendarOptions {
  festivals?: MarketCalendarEvent[];
  taxRules?: TaxComplianceRule[];
  enabledFestivals?: string[];
  customMultipliers?: Record<string, number>;
  enableWeekendSurge?: boolean;
}

/**
 * Determine whether a given Saturday is the 2nd or 4th Saturday of the month (Indian Banking Holiday)
 */
export function isSecondOrFourthSaturday(d: Date): boolean {
  if (d.getDay() !== 6) return false;
  const dayOfMonth = d.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);
  return weekNum === 2 || weekNum === 4;
}

/**
 * Analyze an exact date and return its Indian financial market context dynamically.
 * Accepts active festivals and tax rules loaded from the database, and filters by enabledFestivals.
 */
export function getIndianDateContext(
  dateInput: string | Date,
  options?: IndianCalendarOptions
): IndianDateContext {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const dateStr = d.toISOString().slice(0, 10);
  const dayOfMonth = d.getDate();
  const dayOfWeek = d.getDay();
  const month = d.getMonth() + 1; // 1-12

  const allFestivals = options?.festivals || AUTHORITATIVE_MARKET_EVENTS_CATALOG;
  const taxRules = options?.taxRules || AUTHORITATIVE_TAX_RULES_CATALOG;

  // Filter festivals if merchant has configured specific enabled festivals
  const festivals =
    options?.enabledFestivals && options.enabledFestivals.length > 0
      ? allFestivals.filter(
          (f) =>
            options.enabledFestivals!.includes(f.id) ||
            options.enabledFestivals!.includes(f.name)
        )
      : allFestivals;

  // 1. Check Indian Festivals and Mega Sales dynamically from database
  const activeFestivals: string[] = [];
  let maxMultiplier = 1.0;

  for (const fest of festivals) {
    if (dateStr >= fest.startDate && dateStr <= fest.endDate) {
      activeFestivals.push(fest.name);
      const customMult =
        options?.customMultipliers?.[fest.id] ?? options?.customMultipliers?.[fest.name];
      const mult =
        customMult !== undefined && customMult > 0 ? customMult : fest.inflowMultiplier;
      if (mult > maxMultiplier) {
        maxMultiplier = mult;
      }
    }
  }

  // 2. Weekend Footfall surge for retail (if enabled, default true)
  if (options?.enableWeekendSurge !== false) {
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      maxMultiplier *= 1.25;
    }
  }

  // 3. Dynamic Statutory Tax Drain Days evaluated against rules
  let isStatutory = false;
  let statutoryName: string | undefined;
  let statutoryCategory: string | undefined;

  for (const rule of taxRules) {
    // For monthly taxes: matches rule.dueDay
    if (rule.frequency === 'MONTHLY' && rule.dueDay === dayOfMonth) {
      isStatutory = true;
      statutoryName = rule.title;
      statutoryCategory = rule.category;
      break;
    }

    // For quarterly or annual taxes: matches rule.dueDay and dueMonths
    if ((rule.frequency === 'QUARTERLY' || rule.frequency === 'ANNUAL') && rule.dueDay === dayOfMonth) {
      const dueMonths = rule.dueMonths || [3, 6, 9, 12];
      if (dueMonths.includes(month)) {
        isStatutory = true;
        statutoryName = rule.title;
        statutoryCategory = rule.category;
        break;
      }
    }
  }

  // 4. Banking settlement friction (2nd/4th Saturday or Sunday)
  const isSettlementDelayed = dayOfWeek === 0 || isSecondOrFourthSaturday(d);

  return {
    date: dateStr,
    isFestivalActive: activeFestivals.length > 0,
    activeFestivals,
    inflowMultiplier: Number(maxMultiplier.toFixed(2)),
    isStatutoryDrainDay: isStatutory,
    statutoryObligationName: statutoryName,
    statutoryCategory,
    isBankSettlementDelayed: isSettlementDelayed,
    dayOfWeek,
  };
}

/**
 * Return all upcoming festive and statutory milestone events within an N-day projection window
 * dynamically based on the merchant's configured active rules and database market events.
 */
export function getUpcomingIndianMilestones(
  startDateStr: string,
  horizonDays: number = 60,
  options?: IndianCalendarOptions
): IndianCalendarMilestone[] {
  const milestones: IndianCalendarMilestone[] = [];
  const baseDate = new Date(startDateStr);
  const allFestivals = options?.festivals || AUTHORITATIVE_MARKET_EVENTS_CATALOG;
  const taxRules = options?.taxRules || AUTHORITATIVE_TAX_RULES_CATALOG;

  const festivals =
    options?.enabledFestivals && options.enabledFestivals.length > 0
      ? allFestivals.filter(
          (f) =>
            options.enabledFestivals!.includes(f.id) ||
            options.enabledFestivals!.includes(f.name)
        )
      : allFestivals;

  for (let i = 1; i <= horizonDays; i++) {
    const cur = new Date(baseDate);
    cur.setDate(baseDate.getDate() + i);
    const dateStr = cur.toISOString().slice(0, 10);
    const ctx = getIndianDateContext(cur, {
      festivals,
      taxRules,
      enabledFestivals: options?.enabledFestivals,
      customMultipliers: options?.customMultipliers,
      enableWeekendSurge: options?.enableWeekendSurge,
    });

    if (ctx.isStatutoryDrainDay) {
      milestones.push({
        date: dateStr,
        dayOffset: i,
        type: 'STATUTORY_TAX',
        title: ctx.statutoryObligationName || 'Statutory Compliance Challan',
        expectedImpact: 'Mandatory statutory tax outflow to government treasury; zero delay tolerance without penalty.',
        recommendedAction: 'Ring-fence statutory reserve in lockbox 3 days prior; do not commit funds to inventory.',
      });
    }

    if (ctx.isFestivalActive && ctx.activeFestivals.length > 0) {
      // Add milestone on the first day of festival
      const isFirstDay = festivals.some(
        (f) => f.startDate === dateStr && ctx.activeFestivals.includes(f.name)
      );
      if (isFirstDay) {
        milestones.push({
          date: dateStr,
          dayOffset: i,
          type: ctx.activeFestivals[0].includes('BBD') || ctx.activeFestivals[0].includes('Sales') || ctx.activeFestivals[0].includes('Festival')
            ? 'MEGA_SALE'
            : 'FESTIVAL',
          title: ctx.activeFestivals.join(' + '),
          expectedImpact: `Projected +${Math.round((ctx.inflowMultiplier - 1) * 100)}% surge in customer collections and footfall.`,
          recommendedAction: 'Ensure payment terminals active; stock fast-moving SKUs 7 days in advance.',
        });
      }
    }
  }

  return milestones;
}
