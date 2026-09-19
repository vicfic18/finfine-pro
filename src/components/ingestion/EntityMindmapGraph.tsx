'use client';

import React, { useState } from 'react';
import {
  Building2,
  Users,
  Store,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  Info,
  X,
  ExternalLink,
  ShieldAlert,
  Percent,
} from 'lucide-react';
import clsx from 'clsx';

interface AlertItem {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';
  label: string;
  detail: string;
  amount?: number;
  dueDate?: string;
  actionText?: string;
}

interface EntityNode {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'VENDOR' | 'TAX';
  categoryLabel: string;
  amount: number;
  gstin?: string;
  status: string;
  alerts: AlertItem[];
  paymentTerms?: string;
}

const ENTITY_DATA: EntityNode[] = [
  // Customers (Receivables)
  {
    id: 'cust-apex',
    name: 'Apex Retail Mart',
    type: 'CUSTOMER',
    categoryLabel: 'Wholesale Retailer',
    amount: 40000,
    gstin: '29AABCA8912E1Z4',
    status: 'Due Soon',
    paymentTerms: 'Net-30',
    alerts: [
      {
        id: 'alt-apex-1',
        severity: 'WARNING',
        label: 'Net-30 Window Expiring in 4 Days',
        detail: 'Consignment #412 payment maturing on Oct 14. Follow up with billing desk.',
        amount: 40000,
        dueDate: '2026-10-14',
        actionText: 'Send WhatsApp Payment Link',
      },
    ],
  },
  {
    id: 'cust-cityfashion',
    name: 'City Fashion Hub',
    type: 'CUSTOMER',
    categoryLabel: 'Retail Chain',
    amount: 55000,
    gstin: '29AABCD1122F1Z7',
    status: 'Delayed Payer',
    paymentTerms: 'Net-21',
    alerts: [
      {
        id: 'alt-cf-1',
        severity: 'WARNING',
        label: 'Float Risk: 6-Day Avg Delay',
        detail: 'High concentration debtor. Realistic settlement expected Oct 25 instead of agreed Oct 19.',
        amount: 55000,
        dueDate: '2026-10-19',
        actionText: 'Request Advance Clearance',
      },
    ],
  },
  {
    id: 'cust-priya',
    name: 'Priya Boutiques',
    type: 'CUSTOMER',
    categoryLabel: 'Independent Boutique',
    amount: 18000,
    gstin: '29AABCP7712K1Z9',
    status: 'Overdue',
    paymentTerms: 'Net-15',
    alerts: [
      {
        id: 'alt-priya-1',
        severity: 'CRITICAL',
        label: '3 Days Overdue (₹18,000)',
        detail: 'Invoice #PB-302 passed maturity on Oct 04. No confirmation on NEFT UTR.',
        amount: 18000,
        dueDate: '2026-10-04',
        actionText: 'Dial Store Manager',
      },
    ],
  },
  {
    id: 'cust-balaji',
    name: 'Balaji Supermarket',
    type: 'CUSTOMER',
    categoryLabel: 'Supermarket Chain',
    amount: 28000,
    gstin: '29AABCB3344G1Z8',
    status: 'Healthy',
    paymentTerms: 'Net-30',
    alerts: [
      {
        id: 'alt-balaji-1',
        severity: 'INFO',
        label: 'High Reliability Score (92%)',
        detail: 'Consistent on-time payer. Settlement expected on Oct 25 without delay.',
        amount: 28000,
        dueDate: '2026-10-25',
      },
    ],
  },

  // Vendors (Payables)
  {
    id: 'vend-sharma',
    name: 'Sharma Textiles & Fabrics',
    type: 'VENDOR',
    categoryLabel: 'Primary Fabric Mill',
    amount: 35000,
    gstin: '27AABCS9921D1Z2',
    status: 'Opportunity',
    paymentTerms: '2/10 Net-30',
    alerts: [
      {
        id: 'alt-sharma-1',
        severity: 'OPPORTUNITY',
        label: '2% Early Cash Discount Expires in 48h',
        detail: 'Pay ₹34,300 before Oct 09 to capture ₹700 instant margin (48% annualized return).',
        amount: 35000,
        dueDate: '2026-10-16',
        actionText: 'Approve Discounted Payout',
      },
    ],
  },
  {
    id: 'vend-aggarwal',
    name: 'Aggarwal Wholesale',
    type: 'VENDOR',
    categoryLabel: 'Yarn & Raw Cotton',
    amount: 48000,
    gstin: '27AABCS3321A1Z9',
    status: 'Credit Warning',
    paymentTerms: 'Net-45',
    alerts: [
      {
        id: 'alt-aggarwal-1',
        severity: 'WARNING',
        label: '85% Trade Credit Ceiling Reached',
        detail: 'Outstanding exceeds ₹1.28L of ₹1.5L line. Next consignment will require partial clearance.',
        amount: 48000,
        dueDate: '2026-10-22',
        actionText: 'View Credit Ledger',
      },
    ],
  },
  {
    id: 'vend-prestige',
    name: 'Prestige Estates (Rent)',
    type: 'VENDOR',
    categoryLabel: 'Commercial Landlord',
    amount: 28000,
    status: 'Priority Overhead',
    paymentTerms: 'Due 10th Monthly',
    alerts: [
      {
        id: 'alt-rent-1',
        severity: 'WARNING',
        label: 'Shop & Godown Rent Due in 3 Days',
        detail: 'Fixed operational overhead due Oct 10. Direct IMPS transfer required.',
        amount: 28000,
        dueDate: '2026-10-10',
        actionText: 'Schedule Rent Payout',
      },
    ],
  },
  {
    id: 'vend-bescom',
    name: 'BESCOM Electricity',
    type: 'VENDOR',
    categoryLabel: 'Utility Provider',
    amount: 8900,
    gstin: '29AAACB1403D1ZN',
    status: 'Auto-Pay Scheduled',
    paymentTerms: 'Due 18th',
    alerts: [
      {
        id: 'alt-bescom-1',
        severity: 'INFO',
        label: 'Scheduled BBPS Auto-Debit',
        detail: 'Commercial meter bill ₹8,900 will be auto-debited from HDFC Current Account on Oct 18.',
        amount: 8900,
        dueDate: '2026-10-18',
      },
    ],
  },

  // Taxes & Statutory Lockbox
  {
    id: 'tax-tds',
    name: 'Income Tax Dept (TDS Challan 281)',
    type: 'TAX',
    categoryLabel: 'Statutory Compliance',
    amount: 14500,
    gstin: 'AABCS1429B (TAN)',
    status: 'Due Today',
    paymentTerms: 'Mandatory Sec 194C/J',
    alerts: [
      {
        id: 'alt-tds-1',
        severity: 'CRITICAL',
        label: 'DUE TODAY (Oct 07) — Avoid 1.5%/mo Penalty',
        detail: 'Monthly contractor & consultant TDS deduction. Interest accrues immediately if missed.',
        amount: 14500,
        dueDate: '2026-10-07',
        actionText: 'Pay Challan 281 Now',
      },
    ],
  },
  {
    id: 'tax-gst',
    name: 'GSTN (GSTR-3B Monthly Return)',
    type: 'TAX',
    categoryLabel: 'Indirect Tax',
    amount: 42000,
    gstin: '27AABCS1429B1Z5',
    status: 'Lockbox Required',
    paymentTerms: 'Due 20th Monthly',
    alerts: [
      {
        id: 'alt-gst-1',
        severity: 'WARNING',
        label: '₹42,000 Reserved in Statutory Lockbox',
        detail: 'Filing due Oct 20. Statutory lockbox prohibits deploying this cash for supplier bills.',
        amount: 42000,
        dueDate: '2026-10-20',
        actionText: 'View Lockbox Balance',
      },
    ],
  },
  {
    id: 'tax-epfo',
    name: 'EPFO & ESIC Contribution',
    type: 'TAX',
    categoryLabel: 'Payroll Statutory',
    amount: 18200,
    gstin: 'BGBNG0012345',
    status: 'Upcoming',
    paymentTerms: 'Due 15th Monthly',
    alerts: [
      {
        id: 'alt-epfo-1',
        severity: 'INFO',
        label: 'Staff PF/ESIC Due Oct 15',
        detail: '5 store and counter staff statutory contribution mapped from payroll.',
        amount: 18200,
        dueDate: '2026-10-15',
      },
    ],
  },
];

export default function EntityMindmapGraph() {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ALERTS' | 'CUSTOMERS' | 'VENDORS' | 'TAXES'>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<EntityNode | null>(null);

  // Groupings
  const customers = ENTITY_DATA.filter((e) => e.type === 'CUSTOMER');
  const vendors = ENTITY_DATA.filter((e) => e.type === 'VENDOR');
  const taxes = ENTITY_DATA.filter((e) => e.type === 'TAX');

  const totalInflowsExpected = customers.reduce((sum, c) => sum + c.amount, 0);
  const totalVendorPayables = vendors.reduce((sum, v) => sum + v.amount, 0);
  const totalStatutoryLockbox = taxes.reduce((sum, t) => sum + t.amount, 0);

  const allAlerts = ENTITY_DATA.flatMap((e) => e.alerts);
  const criticalAlertsCount = allAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const warningAlertsCount = allAlerts.filter((a) => a.severity === 'WARNING').length;
  const opportunityAlertsCount = allAlerts.filter((a) => a.severity === 'OPPORTUNITY').length;

  const filterMatches = (entity: EntityNode) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'ALERTS') {
      return entity.alerts.some((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING' || a.severity === 'OPPORTUNITY');
    }
    if (activeFilter === 'CUSTOMERS') return entity.type === 'CUSTOMER';
    if (activeFilter === 'VENDORS') return entity.type === 'VENDOR';
    if (activeFilter === 'TAXES') return entity.type === 'TAX';
    return true;
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-none relative overflow-hidden shadow-xs">
      
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-display font-bold text-lg text-neutral-900 tracking-tight">
              Entity Mindmap & Operational Alerts Graph
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time entity relationship mapping: Core business anchor, active customer receivables, vendor payables, and statutory tax obligations.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center flex-wrap gap-1.5 font-sans text-xs">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all border",
              activeFilter === 'ALL'
                ? "bg-neutral-900 text-white border-neutral-900"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100"
            )}
          >
            All Entities ({ENTITY_DATA.length})
          </button>
          <button
            onClick={() => setActiveFilter('ALERTS')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all border flex items-center space-x-1.5",
              activeFilter === 'ALERTS'
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-red-600 border-red-200 hover:bg-red-50"
            )}
          >
            <AlertTriangle size={13} />
            <span>Active Alerts ({criticalAlertsCount + warningAlertsCount + opportunityAlertsCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('CUSTOMERS')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all border",
              activeFilter === 'CUSTOMERS'
                ? "bg-emerald-700 text-white border-emerald-700"
                : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            )}
          >
            Customers ({customers.length})
          </button>
          <button
            onClick={() => setActiveFilter('VENDORS')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all border",
              activeFilter === 'VENDORS'
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            )}
          >
            Vendors ({vendors.length})
          </button>
          <button
            onClick={() => setActiveFilter('TAXES')}
            className={clsx(
              "px-3 py-1.5 font-semibold transition-all border",
              activeFilter === 'TAXES'
                ? "bg-amber-700 text-white border-amber-700"
                : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
            )}
          >
            Taxes & Statutory ({taxes.length})
          </button>
        </div>
      </div>

      {/* Main Visual Mindmap Canvas */}
      <div className="p-6 sm:p-8 bg-white relative min-h-[580px] flex flex-col justify-between overflow-x-auto">
        
        {/* Halftone subtle background texture */}
        <div className="absolute inset-0 halftone-dots opacity-40 pointer-events-none" />

        {/* 1. TOP SECTION: CENTRAL BUSINESS HUB */}
        <div className="relative z-10 flex flex-col items-center mb-10">
          <div className="bg-neutral-900 text-white px-8 py-5 border-2 border-neutral-900 shadow-lg text-center max-w-md w-full relative group">
            
            {/* Top Anchor Tag */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-neutral-900 border border-neutral-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Tenant Hub • msme-001
            </div>

            <div className="flex items-center justify-center space-x-2.5 mb-1.5">
              <Building2 className="text-white" size={22} />
              <h3 className="font-display font-bold text-2xl tracking-tight text-white">
                Shree Ganesh Enterprises
              </h3>
            </div>
            
            <p className="text-xs text-neutral-300 font-sans mb-3">
              Apparel Manufacturing & Trade • Current A/C HDFC •••1045
            </p>

            {/* Hub Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-neutral-800 text-left">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-semibold">
                  Receivables
                </span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  +₹{(totalInflowsExpected / 1000).toFixed(0)}k
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-semibold">
                  Payables
                </span>
                <span className="text-sm font-bold text-indigo-300 font-mono">
                  -₹{(totalVendorPayables / 1000).toFixed(0)}k
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 block font-semibold">
                  Tax Lockbox
                </span>
                <span className="text-sm font-bold text-amber-400 font-mono">
                  ₹{(totalStatutoryLockbox / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          </div>

          {/* Central Stem Rail */}
          <div className="w-0.5 h-10 bg-neutral-300 my-0 relative">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 absolute -bottom-1.5 -left-1" />
          </div>
        </div>

        {/* 2. THREE PRIMARY CLUSTER COLUMNS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 w-full max-w-7xl mx-auto">
          
          {/* CLUSTER A: CUSTOMERS */}
          <div className={clsx(
            "flex flex-col space-y-4 transition-all duration-300",
            activeFilter === 'VENDORS' || activeFilter === 'TAXES' ? "opacity-30 pointer-events-none" : "opacity-100"
          )}>
            {/* Cluster Header */}
            <div className="bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-none">
                  <ArrowUpRight size={18} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-neutral-900 text-base">
                    Customers (Inflows)
                  </h4>
                  <span className="text-[11px] text-emerald-700 font-semibold font-mono">
                    ₹{totalInflowsExpected.toLocaleString('en-IN')} Total Maturing
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300 font-mono">
                {customers.length} Accounts
              </span>
            </div>

            {/* Sub-Nodes */}
            <div className="flex flex-col space-y-3">
              {customers.map((entity) => {
                const isMatched = filterMatches(entity);
                if (!isMatched) return null;
                const hasCritical = entity.alerts.some((a) => a.severity === 'CRITICAL');
                const hasWarning = entity.alerts.some((a) => a.severity === 'WARNING');

                return (
                  <div
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity)}
                    className={clsx(
                      "p-3.5 bg-white border transition-all cursor-pointer relative hover:shadow-md",
                      hasCritical
                        ? "border-red-400 bg-red-50/20"
                        : hasWarning
                        ? "border-amber-300 hover:border-emerald-500"
                        : "border-neutral-200 hover:border-emerald-500"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-neutral-900 text-sm">{entity.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-200">
                            {entity.categoryLabel}
                          </span>
                        </div>
                        <span className="text-xs text-neutral-500 block mt-0.5 font-mono">
                          GSTIN: {entity.gstin}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 font-mono text-sm block">
                          +₹{entity.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-sans">
                          {entity.paymentTerms}
                        </span>
                      </div>
                    </div>

                    {/* Associated Alert Tags */}
                    {entity.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={clsx(
                          "mt-2.5 p-2 text-xs flex items-start space-x-2 border",
                          alert.severity === 'CRITICAL'
                            ? "bg-red-50 border-red-200 text-red-800"
                            : alert.severity === 'WARNING'
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-neutral-50 border-neutral-200 text-neutral-700"
                        )}
                      >
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">{alert.label}</div>
                          <div className="text-[11px] opacity-80 mt-0.5">{alert.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CLUSTER B: VENDORS */}
          <div className={clsx(
            "flex flex-col space-y-4 transition-all duration-300",
            activeFilter === 'CUSTOMERS' || activeFilter === 'TAXES' ? "opacity-30 pointer-events-none" : "opacity-100"
          )}>
            {/* Cluster Header */}
            <div className="bg-indigo-50 border border-indigo-200 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-none">
                  <ArrowDownLeft size={18} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-neutral-900 text-base">
                    Vendors (Payables)
                  </h4>
                  <span className="text-[11px] text-indigo-700 font-semibold font-mono">
                    ₹{totalVendorPayables.toLocaleString('en-IN')} Total Scheduled
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[11px] font-bold border border-indigo-300 font-mono">
                {vendors.length} Suppliers
              </span>
            </div>

            {/* Sub-Nodes */}
            <div className="flex flex-col space-y-3">
              {vendors.map((entity) => {
                const isMatched = filterMatches(entity);
                if (!isMatched) return null;
                const hasOpportunity = entity.alerts.some((a) => a.severity === 'OPPORTUNITY');
                const hasWarning = entity.alerts.some((a) => a.severity === 'WARNING');

                return (
                  <div
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity)}
                    className={clsx(
                      "p-3.5 bg-white border transition-all cursor-pointer relative hover:shadow-md",
                      hasOpportunity
                        ? "border-emerald-400 bg-emerald-50/15"
                        : hasWarning
                        ? "border-amber-300 hover:border-indigo-500"
                        : "border-neutral-200 hover:border-indigo-500"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-neutral-900 text-sm">{entity.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-200">
                            {entity.categoryLabel}
                          </span>
                        </div>
                        {entity.gstin && (
                          <span className="text-xs text-neutral-500 block mt-0.5 font-mono">
                            GSTIN: {entity.gstin}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-indigo-700 font-mono text-sm block">
                          -₹{entity.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-sans">
                          {entity.paymentTerms}
                        </span>
                      </div>
                    </div>

                    {/* Associated Alert Tags */}
                    {entity.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={clsx(
                          "mt-2.5 p-2 text-xs flex items-start space-x-2 border",
                          alert.severity === 'OPPORTUNITY'
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : alert.severity === 'WARNING'
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-neutral-50 border-neutral-200 text-neutral-700"
                        )}
                      >
                        {alert.severity === 'OPPORTUNITY' ? (
                          <Percent size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold">{alert.label}</div>
                          <div className="text-[11px] opacity-80 mt-0.5">{alert.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CLUSTER C: TAXES & STATUTORY LOCKBOX */}
          <div className={clsx(
            "flex flex-col space-y-4 transition-all duration-300",
            activeFilter === 'CUSTOMERS' || activeFilter === 'VENDORS' ? "opacity-30 pointer-events-none" : "opacity-100"
          )}>
            {/* Cluster Header */}
            <div className="bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-600 text-white rounded-none">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-neutral-900 text-base">
                    Taxes & Statutory Lockbox
                  </h4>
                  <span className="text-[11px] text-amber-800 font-semibold font-mono">
                    ₹{totalStatutoryLockbox.toLocaleString('en-IN')} Mandatory Earmark
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300 font-mono">
                {taxes.length} Authorities
              </span>
            </div>

            {/* Sub-Nodes */}
            <div className="flex flex-col space-y-3">
              {taxes.map((entity) => {
                const isMatched = filterMatches(entity);
                if (!isMatched) return null;
                const hasCritical = entity.alerts.some((a) => a.severity === 'CRITICAL');

                return (
                  <div
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity)}
                    className={clsx(
                      "p-3.5 bg-white border transition-all cursor-pointer relative hover:shadow-md",
                      hasCritical
                        ? "border-red-500 bg-red-50/25 ring-1 ring-red-400"
                        : "border-neutral-200 hover:border-amber-500"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-neutral-900 text-sm">{entity.name}</span>
                        </div>
                        <span className="text-xs text-neutral-500 block mt-0.5 font-mono">
                          ID: {entity.gstin || 'Govt Assessment'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-800 font-mono text-sm block">
                          ₹{entity.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-sans">
                          {entity.paymentTerms}
                        </span>
                      </div>
                    </div>

                    {/* Associated Alert Tags */}
                    {entity.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={clsx(
                          "mt-2.5 p-2 text-xs flex items-start space-x-2 border",
                          alert.severity === 'CRITICAL'
                            ? "bg-red-50 border-red-300 text-red-900 font-semibold"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                        )}
                      >
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />
                        <div className="flex-1">
                          <div className="font-semibold">{alert.label}</div>
                          <div className="text-[11px] opacity-80 mt-0.5">{alert.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Slide-over Entity Inspector Modal */}
      {selectedEntity && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white border-2 border-neutral-900 max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedEntity(null)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xs uppercase font-bold tracking-wider text-neutral-400">
                Entity Record • {selectedEntity.type}
              </span>
            </div>
            <h3 className="font-display font-bold text-2xl text-neutral-900 mb-1">
              {selectedEntity.name}
            </h3>
            <p className="text-xs text-neutral-500 font-mono mb-4">
              GSTIN / Tax ID: {selectedEntity.gstin || 'Unspecified'} • {selectedEntity.categoryLabel}
            </p>

            <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 border border-neutral-200 mb-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-500 block">
                  Maturing Balance
                </span>
                <span className="text-lg font-bold font-mono text-neutral-900">
                  ₹{selectedEntity.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-500 block">
                  Agreed Payment Terms
                </span>
                <span className="text-sm font-semibold text-neutral-800">
                  {selectedEntity.paymentTerms || 'Standard'}
                </span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 block">
                Active Regulatory & Solvency Alerts:
              </span>
              {selectedEntity.alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={clsx(
                    "p-3 text-xs border flex flex-col space-y-1",
                    alt.severity === 'CRITICAL'
                      ? "bg-red-50 border-red-300 text-red-900"
                      : alt.severity === 'WARNING'
                      ? "bg-amber-50 border-amber-300 text-amber-900"
                      : "bg-neutral-50 border-neutral-200 text-neutral-800"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{alt.label}</span>
                    {alt.dueDate && (
                      <span className="font-mono text-[10px] opacity-75">
                        Due: {alt.dueDate}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-90">{alt.detail}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSelectedEntity(null)}
                className="px-4 py-2 text-xs font-semibold border border-neutral-300 hover:bg-neutral-100 text-neutral-700"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
