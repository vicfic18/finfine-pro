/**
 * Indian Statutory Tax Rules & Business Matching Engine
 * 
 * Provides automated rule evaluation for Indian MSMEs:
 * - Direct Taxes (CBDT: TDS, TCS, Advance Tax u/s 208-211)
 * - Indirect Taxes (CBIC: GSTR-1, GSTR-3B, CMP-08, IFF)
 * - Social Security & Payroll (EPFO u/s 6, ESIC u/s 40, State Professional Tax)
 * - Corporate & ROC Governance (MCA: AOC-4, MGT-7, DIR-3 KYC, Tax Audit u/s 44AB)
 */

export type BusinessEntityType =
  | 'SOLE_PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'LLP'
  | 'PVT_LTD'
  | 'FREELANCER';

export type TurnoverBracket =
  | 'BELOW_20L'
  | '20L_40L'
  | '40L_1_5CR'
  | '1_5CR_5CR'
  | 'ABOVE_5CR';

export type GstSchemeType =
  | 'REGULAR_MONTHLY'
  | 'QRMP_QUARTERLY'
  | 'COMPOSITION'
  | 'UNREGISTERED';

export type TaxCategory =
  | 'GST'
  | 'TDS'
  | 'ADVANCE_TAX'
  | 'PAYROLL'
  | 'MCA_ROC'
  | 'AUDIT'
  | 'STATE_TAX';

export interface TaxApplicabilityCriteria {
  entityTypes: BusinessEntityType[];
  minTurnoverInr?: number;
  maxTurnoverInr?: number;
  gstSchemes?: GstSchemeType[];
  minEmployees?: number;
  applicableStates?: string[];
  isMandatory: boolean;
}

export interface TaxComplianceRule {
  id: string;
  ruleCode: string;
  title: string;
  category: TaxCategory;
  taxAuthority: string;
  form: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  dueDay: number; // Day of month (e.g. 7, 11, 15, 20, 30)
  dueMonths?: number[]; // Array of months (1-12) if quarterly or annual
  defaultEstimatedAmount: number;
  penaltyClauses: string;
  legalSection: string;
  applicabilityCriteria: TaxApplicabilityCriteria;
  riskWarningMessage: string;
  description: string;
}

export interface MarketCalendarEvent {
  id: string;
  name: string;
  category: 'FESTIVAL_PEAK' | 'MEGA_SALE' | 'BANKING_FRICTION';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  inflowMultiplier: number;
  outflowUplift: number;
  description: string;
}

export interface MerchantTaxProfile {
  tenantId: string;
  entityType: BusinessEntityType;
  turnoverBracket: TurnoverBracket;
  annualTurnover: number;
  gstScheme: GstSchemeType;
  employeeCount: number;
  state: string;
  pan?: string;
  gstin?: string;
  tan?: string;
  cin?: string;
  selectedRuleCodes: string[];
  customRuleAmounts: Record<string, number>;
  acknowledgedWarnings: string[];
  updatedAt?: string;
}

export interface MatchedTaxRule {
  rule: TaxComplianceRule;
  isMandatory: boolean;
  matchReason: string;
  nextDueDate: string;
  daysUntilDue: number;
  estimatedAmount: number;
  isSelected: boolean;
}

// ============================================================================
// Authoritative Indian Tax Rules Catalog (Procured from CBIC, CBDT, MCA, EPFO)
// ============================================================================

export const AUTHORITATIVE_TAX_RULES_CATALOG: TaxComplianceRule[] = [
  // --- 1. GOODS & SERVICES TAX (GST) ---
  {
    id: 'rule-gst-gstr3b',
    ruleCode: 'GST_GSTR3B',
    title: 'GSTR-3B Monthly Return & Tax Settlement',
    category: 'GST',
    taxAuthority: 'CBIC (GST Network)',
    form: 'GSTR-3B',
    frequency: 'MONTHLY',
    dueDay: 20,
    defaultEstimatedAmount: 45000,
    penaltyClauses: '₹50/day late fee (₹20 for nil) + 18% p.a. interest under Section 50 of CGST Act',
    legalSection: 'Section 39 of CGST Act, 2017 read with Rule 61(5)',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minTurnoverInr: 2000000,
      gstSchemes: ['REGULAR_MONTHLY'],
      isMandatory: true,
    },
    riskWarningMessage:
      'GSTR-3B is legally mandatory under Section 39 of the CGST Act. Non-settlement will block your electronic credit ledger, freeze outbound E-Way Bill generation, and incur ₹50/day late fees plus 18% annual interest. Excluding this from your financial forecast will create unexpected cash shortages.',
    description:
      'Summary return of outward supplies, input tax credit claimed, and net cash tax liability payment to government treasuries.',
  },
  {
    id: 'rule-gst-gstr1',
    ruleCode: 'GST_GSTR1',
    title: 'GSTR-1 Monthly Outward Supplies Statement',
    category: 'GST',
    taxAuthority: 'CBIC (GST Network)',
    form: 'GSTR-1',
    frequency: 'MONTHLY',
    dueDay: 11,
    defaultEstimatedAmount: 0,
    penaltyClauses: '₹50/day late fee under Section 47 of CGST Act; downstream buyers cannot claim ITC in GSTR-2B',
    legalSection: 'Section 37 of CGST Act, 2017 read with Rule 59',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minTurnoverInr: 2000000,
      gstSchemes: ['REGULAR_MONTHLY'],
      isMandatory: true,
    },
    riskWarningMessage:
      'Filing GSTR-1 is mandatory by the 11th. Delay blocks your B2B customers from claiming Input Tax Credit (ITC) in their GSTR-2B, jeopardizing commercial customer relationships and leading to invoice payment holds.',
    description:
      'Detailed invoice-level reporting of all sales and outward supplies to ensure recipient ITC eligibility.',
  },
  {
    id: 'rule-gst-cmp08',
    ruleCode: 'GST_CMP08',
    title: 'CMP-08 Composition Scheme Quarterly Tax Challan',
    category: 'GST',
    taxAuthority: 'CBIC (GST Network)',
    form: 'CMP-08',
    frequency: 'QUARTERLY',
    dueDay: 18,
    dueMonths: [4, 7, 10, 1], // Jan, Apr, Jul, Oct
    defaultEstimatedAmount: 18000,
    penaltyClauses: '₹50/day late fee + 18% p.a. interest for delay under Section 10 & 50',
    legalSection: 'Section 10 of CGST Act, 2017 read with Rule 62',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
      maxTurnoverInr: 15000000,
      gstSchemes: ['COMPOSITION'],
      isMandatory: true,
    },
    riskWarningMessage:
      'Composition dealers are legally required to file CMP-08 within 18 days of each quarter end. Late settlement revokes eligibility for the concessional tax rate under Section 10.',
    description:
      'Quarterly self-assessed tax payment statement for small dealers under the simplified composition levy.',
  },
  {
    id: 'rule-gst-iff',
    ruleCode: 'GST_IFF_QRMP',
    title: 'Invoice Furnishing Facility (IFF) - QRMP Scheme',
    category: 'GST',
    taxAuthority: 'CBIC (GST Network)',
    form: 'IFF',
    frequency: 'MONTHLY',
    dueDay: 13,
    defaultEstimatedAmount: 0,
    penaltyClauses: 'Voluntary monthly upload; delay causes B2B buyer ITC postponement to quarter-end',
    legalSection: 'Rule 59(2) of CGST Rules, 2017',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      gstSchemes: ['QRMP_QUARTERLY'],
      isMandatory: false,
    },
    riskWarningMessage:
      'While IFF is optional for QRMP taxpayers, skipping it prevents B2B clients from claiming monthly ITC, which may cause institutional clients to withhold payment.',
    description:
      'Optional monthly invoice upload window for quarterly filers to pass on Input Tax Credit to corporate clients.',
  },

  // --- 2. DIRECT TAXES & WITHHOLDING (CBDT) ---
  {
    id: 'rule-tds-194c-j',
    ruleCode: 'TDS_DEPOSIT_MONTHLY',
    title: 'Monthly TDS Deposit (Section 194C / 194J / 194H / 194I)',
    category: 'TDS',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Challan ITNS 281',
    frequency: 'MONTHLY',
    dueDay: 7,
    defaultEstimatedAmount: 32000,
    penaltyClauses: '1.5% per month interest under Section 201(1A) + penalty under Section 271C',
    legalSection: 'Section 200(1) of Income Tax Act, 1961 read with Rule 30',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minTurnoverInr: 5000000,
      isMandatory: true,
    },
    riskWarningMessage:
      'Depositing deducted TDS by the 7th is a strict statutory requirement. Delay triggers 1.5% monthly compound interest under Section 201(1A), disallows 30% of vendor expenses under Section 40(a)(ia), and attracts prosecutable notices.',
    description:
      'Monthly remittance of Tax Deducted at Source on contractor payments, professional fees, commissions, and commercial rent.',
  },
  {
    id: 'rule-advance-tax-q1',
    ruleCode: 'ADVANCE_TAX_Q1',
    title: 'Advance Tax Installment 1 (15% Cumulative)',
    category: 'ADVANCE_TAX',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Challan ITNS 280',
    frequency: 'QUARTERLY',
    dueDay: 15,
    dueMonths: [6], // June 15
    defaultEstimatedAmount: 25000,
    penaltyClauses: '1% simple interest per month under Section 234C for deferment',
    legalSection: 'Section 208 read with Section 211(1)(a) of Income Tax Act',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'FREELANCER'],
      minTurnoverInr: 2000000,
      isMandatory: true,
    },
    riskWarningMessage:
      'Mandatory for businesses with annual tax liability exceeding ₹10,000. Deferment attracts penal interest of 1% per month under Section 234C on the shortfall.',
    description:
      'First installment (15% of total projected annual income tax liability) due by June 15.',
  },
  {
    id: 'rule-advance-tax-q2',
    ruleCode: 'ADVANCE_TAX_Q2',
    title: 'Advance Tax Installment 2 (45% Cumulative)',
    category: 'ADVANCE_TAX',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Challan ITNS 280',
    frequency: 'QUARTERLY',
    dueDay: 15,
    dueMonths: [9], // September 15
    defaultEstimatedAmount: 50000,
    penaltyClauses: '1% simple interest per month under Section 234C for deferment',
    legalSection: 'Section 208 read with Section 211(1)(b) of Income Tax Act',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'FREELANCER'],
      minTurnoverInr: 2000000,
      isMandatory: true,
    },
    riskWarningMessage:
      'Mandatory cumulative 45% tax settlement due by September 15. Failing to ring-fence this capital will trigger substantial Section 234C penal interest.',
    description:
      'Second installment bringing cumulative advance tax deposits up to 45% of total estimated liability.',
  },
  {
    id: 'rule-advance-tax-q3',
    ruleCode: 'ADVANCE_TAX_Q3',
    title: 'Advance Tax Installment 3 (75% Cumulative)',
    category: 'ADVANCE_TAX',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Challan ITNS 280',
    frequency: 'QUARTERLY',
    dueDay: 15,
    dueMonths: [12], // December 15
    defaultEstimatedAmount: 60000,
    penaltyClauses: '1% simple interest per month under Section 234C',
    legalSection: 'Section 208 read with Section 211(1)(c) of Income Tax Act',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'FREELANCER'],
      minTurnoverInr: 2000000,
      isMandatory: true,
    },
    riskWarningMessage:
      'Critical year-end installment. Reaching 75% tax settlement by December 15 prevents steep interest compounding through the Q4 financial year closure.',
    description:
      'Third installment bringing cumulative advance tax deposits up to 75% of fiscal year liability.',
  },
  {
    id: 'rule-advance-tax-q4',
    ruleCode: 'ADVANCE_TAX_Q4',
    title: 'Advance Tax Installment 4 (100% Final Settlement)',
    category: 'ADVANCE_TAX',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Challan ITNS 280',
    frequency: 'QUARTERLY',
    dueDay: 15,
    dueMonths: [3], // March 15
    defaultEstimatedAmount: 75000,
    penaltyClauses: '1% per month under Section 234B (shortfall) and Section 234C (deferment)',
    legalSection: 'Section 208 read with Section 211(1)(d) of Income Tax Act',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'FREELANCER'],
      minTurnoverInr: 2000000,
      isMandatory: true,
    },
    riskWarningMessage:
      'Final installment before March 31 financial year close. Any unpaid tax carries 1% per month interest under Section 234B until actual return filing date.',
    description:
      'Final installment completing 100% of the financial year total advance income tax liability.',
  },

  // --- 3. PAYROLL & SOCIAL SECURITY ---
  {
    id: 'rule-epfo-contribution',
    ruleCode: 'EPFO_MONTHLY',
    title: 'Employees Provident Fund (EPF) Monthly Remittance',
    category: 'PAYROLL',
    taxAuthority: 'EPFO (Ministry of Labour)',
    form: 'Electronic Challan cum Return (ECR)',
    frequency: 'MONTHLY',
    dueDay: 15,
    defaultEstimatedAmount: 24000,
    penaltyClauses: 'Damages up to 25% under Section 14B + 12% interest under Section 7Q of EPF Act',
    legalSection: 'Section 6 of Employees Provident Funds & Misc Provisions Act, 1952',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minEmployees: 20,
      isMandatory: true,
    },
    riskWarningMessage:
      'EPFO compliance is statutorily mandatory for establishments with 20 or more staff. Default attracts severe penal damages (up to 25%) and potential prosecution under Section 14.',
    description:
      'Monthly deposit of employer and employee provident fund contributions (12% of basic + DA) along with EDLI and admin charges.',
  },
  {
    id: 'rule-esic-contribution',
    ruleCode: 'ESIC_MONTHLY',
    title: 'Employees State Insurance (ESI) Monthly Contribution',
    category: 'PAYROLL',
    taxAuthority: 'ESIC (Ministry of Labour)',
    form: 'ESIC Monthly Challan',
    frequency: 'MONTHLY',
    dueDay: 15,
    defaultEstimatedAmount: 12000,
    penaltyClauses: '12% simple interest under Regulation 31A + damages under Regulation 31C',
    legalSection: 'Section 40 of Employees State Insurance Act, 1948',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minEmployees: 10,
      isMandatory: true,
    },
    riskWarningMessage:
      'Mandatory for establishments with 10 or more employees with wages under ₹21,000/mo. Non-payment suspends medical benefits and leads to recovery proceedings.',
    description:
      'Monthly health and sickness insurance premium remittance (3.25% employer + 0.75% employee contribution).',
  },
  {
    id: 'rule-professional-tax',
    ruleCode: 'PROFESSIONAL_TAX',
    title: 'State Professional Tax (PT) Monthly Return & Remittance',
    category: 'STATE_TAX',
    taxAuthority: 'State Commercial Tax Department',
    form: 'PT Challan (Form III / Form 5)',
    frequency: 'MONTHLY',
    dueDay: 20,
    defaultEstimatedAmount: 3500,
    penaltyClauses: 'Late fee up to ₹1,000 + 1.25% to 2% monthly interest as per respective State PT Act',
    legalSection: 'State Professional Tax Acts (e.g., Maharashtra PT Act, 1975)',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      applicableStates: ['Maharashtra', 'Karnataka', 'Tamil Nadu', 'West Bengal', 'Gujarat', 'Telangana'],
      isMandatory: true,
    },
    riskWarningMessage:
      'Professional Tax is a mandatory employer deduction in applicable states. Failure to deposit incurs compounding interest and fines from state authorities.',
    description:
      'State-level direct tax levied on salaried employees and practicing business professionals.',
  },

  // --- 4. CORPORATE & ROC GOVERNANCE (MCA) ---
  {
    id: 'rule-mca-dir3-kyc',
    ruleCode: 'MCA_DIR3_KYC',
    title: 'Annual Director e-KYC (DIR-3 KYC)',
    category: 'MCA_ROC',
    taxAuthority: 'Ministry of Corporate Affairs (MCA)',
    form: 'DIR-3 KYC / DIR-3 KYC WEB',
    frequency: 'ANNUAL',
    dueDay: 30,
    dueMonths: [9], // September 30
    defaultEstimatedAmount: 0,
    penaltyClauses: '₹5,000 late fee per director DIN deactivation under Rule 12A of Companies Rules',
    legalSection: 'Rule 12A of Companies (Appointment and Qualification of Directors) Rules, 2014',
    applicabilityCriteria: {
      entityTypes: ['PVT_LTD', 'LLP'],
      isMandatory: true,
    },
    riskWarningMessage:
      'Every DIN holder must file DIR-3 KYC annually by September 30. Missing this deactivates the Director Identification Number and incurs a non-waivable ₹5,000 government penalty.',
    description:
      'Mandatory annual identity verification for all company directors and designated partners.',
  },
  {
    id: 'rule-mca-aoc4',
    ruleCode: 'MCA_AOC4',
    title: 'Financial Statements Filing (Form AOC-4)',
    category: 'MCA_ROC',
    taxAuthority: 'Ministry of Corporate Affairs (MCA)',
    form: 'Form AOC-4 / AOC-4 XBRL',
    frequency: 'ANNUAL',
    dueDay: 30,
    dueMonths: [10], // October 30 (30 days from AGM)
    defaultEstimatedAmount: 15000,
    penaltyClauses: '₹100 per day of delay without upper limit under Section 403 of Companies Act, 2013',
    legalSection: 'Section 137 of Companies Act, 2013 read with Rule 12',
    applicabilityCriteria: {
      entityTypes: ['PVT_LTD'],
      isMandatory: true,
    },
    riskWarningMessage:
      'AOC-4 must be filed within 30 days of the AGM. Missing the deadline attracts a daily penalty of ₹100 per day with no maximum limit, rapidly accumulating massive compliance liabilities.',
    description:
      'Annual submission of audited balance sheet, profit and loss account, director report, and auditor notes to the Registrar of Companies.',
  },
  {
    id: 'rule-mca-mgt7',
    ruleCode: 'MCA_MGT7',
    title: 'Annual Return Filing (Form MGT-7 / MGT-7A)',
    category: 'MCA_ROC',
    taxAuthority: 'Ministry of Corporate Affairs (MCA)',
    form: 'Form MGT-7 / MGT-7A',
    frequency: 'ANNUAL',
    dueDay: 29,
    dueMonths: [11], // November 29 (60 days from AGM)
    defaultEstimatedAmount: 10000,
    penaltyClauses: '₹100 per day continuing late fee under Section 92(5) of Companies Act, 2013',
    legalSection: 'Section 92 of Companies Act, 2013 read with Rule 11',
    applicabilityCriteria: {
      entityTypes: ['PVT_LTD'],
      isMandatory: true,
    },
    riskWarningMessage:
      'Mandatory annual statutory return due within 60 days of the AGM. Continuous default risks company strike-off and director disqualification.',
    description:
      'Comprehensive annual filing covering shareholding structure, board meetings, director remuneration, and corporate governance compliance.',
  },
  {
    id: 'rule-tax-audit-44ab',
    ruleCode: 'TAX_AUDIT_44AB',
    title: 'Statutory Tax Audit Report (Section 44AB)',
    category: 'AUDIT',
    taxAuthority: 'CBDT (Income Tax Dept)',
    form: 'Form 3CA/3CB & Form 3CD',
    frequency: 'ANNUAL',
    dueDay: 30,
    dueMonths: [9], // September 30
    defaultEstimatedAmount: 35000,
    penaltyClauses: '0.5% of turnover up to a maximum of ₹1,50,000 under Section 271B',
    legalSection: 'Section 44AB of Income Tax Act, 1961',
    applicabilityCriteria: {
      entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD'],
      minTurnoverInr: 10000000, // ₹1 Crore
      isMandatory: true,
    },
    riskWarningMessage:
      'Tax Audit is legally mandated under Section 44AB when business turnover crosses prescribed limits. Failure to complete audit by September 30 carries a penalty of 0.5% of total turnover up to ₹1.5 Lakhs.',
    description:
      'Comprehensive examination of accounts by a practicing Chartered Accountant ensuring tax law compliance.',
  },
];

// ============================================================================
// Authoritative Indian Market Calendar Registry (2025 - 2027)
// ============================================================================

export const AUTHORITATIVE_MARKET_EVENTS_CATALOG: MarketCalendarEvent[] = [
  {
    id: 'mkt-holi-2026',
    name: 'Holi Festive Retail Surge',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    inflowMultiplier: 1.4,
    outflowUplift: 15000,
    description: 'Holi festival retail demand surge for sweets, apparel, and FMCG.',
  },
  {
    id: 'mkt-eid-2026',
    name: 'Eid-ul-Fitr Shopping Season',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-03-18',
    endDate: '2026-03-22',
    inflowMultiplier: 1.6,
    outflowUplift: 25000,
    description: 'High cash flow surge in retail apparel, footwear, and consumer goods.',
  },
  {
    id: 'mkt-raksha-bandhan-2026',
    name: 'Raksha Bandhan Gifting Peak',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-08-26',
    endDate: '2026-08-29',
    inflowMultiplier: 1.5,
    outflowUplift: 20000,
    description: 'Surge in gifts, jewelry, confectionary, and retail footfall.',
  },
  {
    id: 'mkt-ganesh-chaturthi-2026',
    name: 'Ganesh Chaturthi Festivities',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-09-12',
    endDate: '2026-09-16',
    inflowMultiplier: 1.45,
    outflowUplift: 20000,
    description: 'Festive purchasing peak across Western & Southern Indian markets.',
  },
  {
    id: 'mkt-mega-sales-2026',
    name: 'Great Indian Festival & Big Billion Days (BBD)',
    category: 'MEGA_SALE',
    startDate: '2026-09-26',
    endDate: '2026-10-06',
    inflowMultiplier: 2.2,
    outflowUplift: 80000,
    description: 'Nationwide retail discounting and consumer shopping frenzy.',
  },
  {
    id: 'mkt-navratri-2026',
    name: 'Navratri & Durga Puja Celebrations',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-11',
    endDate: '2026-10-19',
    inflowMultiplier: 1.9,
    outflowUplift: 40000,
    description: '9-day sustained retail purchasing surge across all MSME sectors.',
  },
  {
    id: 'mkt-dussehra-2026',
    name: 'Dussehra (Vijayadashami)',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    inflowMultiplier: 2.1,
    outflowUplift: 25000,
    description: 'Auspicious purchase day for electronics, vehicles, and capital goods.',
  },
  {
    id: 'mkt-dhanteras-2026',
    name: 'Dhanteras Auspicious Buying',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-27',
    endDate: '2026-10-29',
    inflowMultiplier: 3.2,
    outflowUplift: 60000,
    description: 'Highest single-day retail cash velocity of the fiscal year.',
  },
  {
    id: 'mkt-diwali-2026',
    name: 'Diwali (Deepavali) Peak',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-10-30',
    endDate: '2026-11-03',
    inflowMultiplier: 2.8,
    outflowUplift: 50000,
    description: 'Grand festive gifting, bonuses, and maximum annual sales volume.',
  },
  {
    id: 'mkt-winter-weddings-2026',
    name: 'Winter Wedding Season Surge',
    category: 'FESTIVAL_PEAK',
    startDate: '2026-11-20',
    endDate: '2026-12-15',
    inflowMultiplier: 1.65,
    outflowUplift: 45000,
    description: 'Sustained wholesale and retail wedding purchases (apparel, jewelry, catering).',
  },
];

// ============================================================================
// Ruleset Matching Engine
// ============================================================================

/**
 * Evaluates business profile against tax rules catalog and returns matching obligations.
 */
export function matchApplicableTaxRules(
  profile: MerchantTaxProfile,
  catalog: TaxComplianceRule[] = AUTHORITATIVE_TAX_RULES_CATALOG,
  asOfDateStr = new Date().toISOString().slice(0, 10)
): MatchedTaxRule[] {
  const asOf = new Date(asOfDateStr);

  const matches: MatchedTaxRule[] = [];

  for (const rule of catalog) {
    const crit = rule.applicabilityCriteria;

    // 1. Entity type check
    const matchesEntity = crit.entityTypes.includes(profile.entityType);
    if (!matchesEntity) continue;

    // 2. Turnover criteria
    if (crit.minTurnoverInr && profile.annualTurnover < crit.minTurnoverInr) {
      continue;
    }
    if (crit.maxTurnoverInr && profile.annualTurnover > crit.maxTurnoverInr) {
      continue;
    }

    // 3. GST Scheme criteria
    if (crit.gstSchemes && !crit.gstSchemes.includes(profile.gstScheme)) {
      continue;
    }

    // 4. Employee count criteria (for PF / ESIC)
    if (crit.minEmployees && profile.employeeCount < crit.minEmployees) {
      continue;
    }

    // 5. State criteria (for Professional Tax)
    if (crit.applicableStates && crit.applicableStates.length > 0) {
      if (!crit.applicableStates.map((s) => s.toLowerCase()).includes((profile.state || '').toLowerCase())) {
        continue;
      }
    }

    // Determine legal match reason
    let matchReason = 'Applicable based on business classification profile.';
    if (rule.category === 'GST') {
      matchReason = `Mandatory under ${rule.legalSection} for ${profile.gstScheme.replace('_', ' ')} scheme taxpayers with turnover > ₹${(rule.applicabilityCriteria.minTurnoverInr || 2000000) / 100000} Lakhs.`;
    } else if (rule.category === 'PAYROLL') {
      matchReason = `Mandatory under ${rule.legalSection} as active workforce (${profile.employeeCount}) meets statutory threshold of ${crit.minEmployees}+ staff.`;
    } else if (rule.category === 'MCA_ROC') {
      matchReason = `Mandatory corporate filing under ${rule.legalSection} for registered ${profile.entityType.replace('_', ' ')} entities.`;
    } else if (rule.category === 'ADVANCE_TAX') {
      matchReason = `Mandatory under ${rule.legalSection} as estimated annual income tax liability exceeds ₹10,000 threshold.`;
    } else if (rule.category === 'TDS') {
      matchReason = `Mandatory withholding tax deposit under ${rule.legalSection} for commercial vendor & contractor transactions.`;
    } else if (rule.category === 'AUDIT') {
      matchReason = `Mandatory statutory audit under ${rule.legalSection} because annual turnover exceeds ₹1 Crore threshold.`;
    }

    // Calculate next due date
    const nextDueDate = calculateNextDueDate(rule, asOf);
    const dueDateObj = new Date(nextDueDate);
    const daysUntilDue = Math.max(0, Math.round((dueDateObj.getTime() - asOf.getTime()) / (1000 * 3600 * 24)));

    // User customized amount or default
    const customAmount = profile.customRuleAmounts?.[rule.ruleCode];
    const estimatedAmount = customAmount !== undefined ? customAmount : rule.defaultEstimatedAmount;

    // Check if user selected this rule (defaults to true for mandatory rules if profile is new)
    const isSelected = profile.selectedRuleCodes?.length > 0
      ? profile.selectedRuleCodes.includes(rule.ruleCode)
      : crit.isMandatory;

    matches.push({
      rule,
      isMandatory: crit.isMandatory,
      matchReason,
      nextDueDate,
      daysUntilDue,
      estimatedAmount,
      isSelected,
    });
  }

  // Sort: mandatory first, then by days until due ascending
  matches.sort((a, b) => {
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  return matches;
}

/**
 * Calculates the next upcoming calendar due date for a statutory tax rule.
 */
export function calculateNextDueDate(rule: TaxComplianceRule, asOf: Date): string {
  const curYear = asOf.getFullYear();
  const curMonth = asOf.getMonth() + 1; // 1-12
  const curDay = asOf.getDate();

  if (rule.frequency === 'MONTHLY') {
    // If due day in this month hasn't passed yet, it's this month; otherwise next month
    let targetYear = curYear;
    let targetMonth = curMonth;

    if (curDay > rule.dueDay) {
      targetMonth += 1;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear += 1;
      }
    }

    const monthStr = String(targetMonth).padStart(2, '0');
    const dayStr = String(rule.dueDay).padStart(2, '0');
    return `${targetYear}-${monthStr}-${dayStr}`;
  }

  if (rule.frequency === 'QUARTERLY' || rule.frequency === 'ANNUAL') {
    const dueMonths = rule.dueMonths || [3, 6, 9, 12];
    
    // Find next upcoming due month in current year
    for (const m of dueMonths) {
      if (m > curMonth || (m === curMonth && rule.dueDay >= curDay)) {
        const monthStr = String(m).padStart(2, '0');
        const dayStr = String(rule.dueDay).padStart(2, '0');
        return `${curYear}-${monthStr}-${dayStr}`;
      }
    }

    // Rollover to first due month in next year
    const nextYear = curYear + 1;
    const firstMonth = dueMonths[0] || 3;
    const monthStr = String(firstMonth).padStart(2, '0');
    const dayStr = String(rule.dueDay).padStart(2, '0');
    return `${nextYear}-${monthStr}-${dayStr}`;
  }

  return `${curYear}-${String(curMonth).padStart(2, '0')}-${String(rule.dueDay).padStart(2, '0')}`;
}
