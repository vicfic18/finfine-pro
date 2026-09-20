/**
 * Indian Financial Calendar & Covariate Engine
 * Provides specialized Indian market domain intelligence for cash flow forecasting:
 * - Major Indian festivals (Diwali, Dhanteras, Navratri, Dussehra, Eid, Holi, etc.)
 * - Mega e-commerce & retail sales periods (Big Billion Days, Great Indian Festival)
 * - Statutory tax payment deadlines (GSTR-3B on 20th, TDS on 7th, Advance Tax)
 * - Indian banking settlement friction (2nd/4th Saturdays, bank holidays)
 */

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
  statutoryCategory?: 'GST' | 'TDS' | 'EPFO' | 'ADVANCE_TAX';
  isBankSettlementDelayed: boolean; // 2nd/4th Sat or Sun
  dayOfWeek: number;
}

// Fixed & Astronomical festival database for Indian MSME retail cycles (2025 - 2027)
export const INDIAN_FESTIVAL_REGISTRY: IndianFestivalEvent[] = [
  // --- 2026 Festival Calendar ---
  {
    name: 'Holi Festive Shopping',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    inflowMultiplier: 1.4,
    outflowUplift: 15000,
    description: 'Holi festival retail demand surge for sweets, apparel, and FMCG.',
  },
  {
    name: 'Eid-ul-Fitr Celebrations',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-03-18',
    endDate: '2026-03-22',
    inflowMultiplier: 1.6,
    outflowUplift: 25000,
    description: 'High cash flow surge in retail apparel, footwear, and consumer goods.',
  },
  {
    name: 'Raksha Bandhan',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-08-26',
    endDate: '2026-08-29',
    inflowMultiplier: 1.5,
    outflowUplift: 20000,
    description: 'Surge in gifts, jewelry, confectionary, and retail footfall.',
  },
  {
    name: 'Ganesh Chaturthi',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-09-12',
    endDate: '2026-09-16',
    inflowMultiplier: 1.45,
    outflowUplift: 20000,
    description: 'Festive purchasing peak across Western & Southern Indian markets.',
  },
  {
    name: 'Great Indian Festival & Big Billion Days (BBD)',
    category: 'MEGA_SALE',
    startDate: '2026-09-26',
    endDate: '2026-10-06',
    inflowMultiplier: 2.2,
    outflowUplift: 80000,
    description: 'Nationwide retail discounting and consumer shopping frenzy.',
  },
  {
    name: 'Navratri & Durga Puja',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-11',
    endDate: '2026-10-19',
    inflowMultiplier: 1.9,
    outflowUplift: 40000,
    description: '9-day sustained retail purchasing surge across all MSME sectors.',
  },
  {
    name: 'Dussehra (Vijayadashami)',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    inflowMultiplier: 2.1,
    outflowUplift: 25000,
    description: 'Auspicious purchase day for electronics, vehicles, and capital goods.',
  },
  {
    name: 'Dhanteras Auspicious Buying',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-27',
    endDate: '2026-10-29',
    inflowMultiplier: 3.2,
    outflowUplift: 60000,
    description: 'Highest single-day retail cash velocity of the fiscal year.',
  },
  {
    name: 'Diwali (Deepavali) Peak',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-30',
    endDate: '2026-11-03',
    inflowMultiplier: 2.8,
    outflowUplift: 50000,
    description: 'Grand festive gifting, bonuses, and maximum annual sales volume.',
  },
  {
    name: 'Winter Wedding Season Surge',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-11-20',
    endDate: '2026-12-15',
    inflowMultiplier: 1.65,
    outflowUplift: 45000,
    description: 'Sustained wholesale and retail wedding purchases (apparel, jewelry, catering).',
  },
];

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
 * Analyze an exact date and return its Indian financial market context
 */
export function getIndianDateContext(dateInput: string | Date): IndianDateContext {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const dateStr = d.toISOString().slice(0, 10);
  const dayOfMonth = d.getDate();
  const dayOfWeek = d.getDay();
  const month = d.getMonth() + 1; // 1-12

  // 1. Check Indian Festivals and Mega Sales
  const activeFestivals: string[] = [];
  let maxMultiplier = 1.0;

  for (const fest of INDIAN_FESTIVAL_REGISTRY) {
    if (dateStr >= fest.startDate && dateStr <= fest.endDate) {
      activeFestivals.push(fest.name);
      if (fest.inflowMultiplier > maxMultiplier) {
        maxMultiplier = fest.inflowMultiplier;
      }
    }
  }

  // 2. Weekend Footfall surge for retail
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    maxMultiplier *= 1.25;
  }

  // 3. Indian Statutory Tax Drain Days
  let isStatutory = false;
  let statutoryName: string | undefined;
  let statutoryCategory: IndianDateContext['statutoryCategory'] | undefined;

  if (dayOfMonth === 7) {
    isStatutory = true;
    statutoryName = 'TDS Deposit Deadline (Section 194C/J)';
    statutoryCategory = 'TDS';
  } else if (dayOfMonth === 15) {
    // Check if it is Advance Tax quarter month (June, September, December, March)
    if (month === 3 || month === 6 || month === 9 || month === 12) {
      isStatutory = true;
      statutoryName = `Advance Tax Installment (Q${month === 6 ? 1 : month === 9 ? 2 : month === 12 ? 3 : 4}) & EPFO/ESIC`;
      statutoryCategory = 'ADVANCE_TAX';
    } else {
      isStatutory = true;
      statutoryName = 'EPFO / ESIC Monthly Remittance';
      statutoryCategory = 'EPFO';
    }
  } else if (dayOfMonth === 20) {
    isStatutory = true;
    statutoryName = 'GSTR-3B Monthly Tax Challan Settlement';
    statutoryCategory = 'GST';
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
 */
export function getUpcomingIndianMilestones(
  startDateStr: string,
  horizonDays: number = 60
): Array<{
  date: string;
  dayOffset: number;
  type: 'FESTIVAL' | 'MEGA_SALE' | 'STATUTORY_TAX';
  title: string;
  expectedImpact: string;
  recommendedAction: string;
}> {
  const milestones: ReturnType<typeof getUpcomingIndianMilestones> = [];
  const baseDate = new Date(startDateStr);

  for (let i = 1; i <= horizonDays; i++) {
    const cur = new Date(baseDate);
    cur.setDate(baseDate.getDate() + i);
    const dateStr = cur.toISOString().slice(0, 10);
    const ctx = getIndianDateContext(cur);

    if (ctx.isStatutoryDrainDay) {
      milestones.push({
        date: dateStr,
        dayOffset: i,
        type: 'STATUTORY_TAX',
        title: ctx.statutoryObligationName || 'Statutory Tax Challan',
        expectedImpact: 'Immediate liquidity outflow to tax authorities; zero delay tolerance without heavy interest.',
        recommendedAction: 'Ring-fence statutory reserve in lockbox 3 days prior; do not commit funds to inventory.',
      });
    }

    if (ctx.isFestivalActive && ctx.activeFestivals.length > 0) {
      // Add milestone on the first day of festival
      const isFirstDay = INDIAN_FESTIVAL_REGISTRY.some(
        (f) => f.startDate === dateStr && ctx.activeFestivals.includes(f.name)
      );
      if (isFirstDay) {
        milestones.push({
          date: dateStr,
          dayOffset: i,
          type: ctx.activeFestivals[0].includes('BBD') || ctx.activeFestivals[0].includes('Festival')
            ? 'MEGA_SALE'
            : 'FESTIVAL',
          title: ctx.activeFestivals.join(' + '),
          expectedImpact: `Projected +${Math.round((ctx.inflowMultiplier - 1) * 100)}% surge in retail customer UPI transactions.`,
          recommendedAction: 'Ensure POS/QR terminals active; stock high-margin fast-moving SKUs 7 days in advance.',
        });
      }
    }
  }

  return milestones;
}
