'use client';

import React, { useState } from 'react';
import {
  Scale,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { StatutoryActRecord } from '@/lib/statutory-cron-service';

interface StatutoryLegislationFeedProps {
  updates: StatutoryActRecord[];
  activeSector: string;
}

export default function StatutoryLegislationFeed({
  updates,
  activeSector,
}: StatutoryLegislationFeedProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!updates || updates.length === 0) return null;

  const displayList = expanded ? updates : updates.slice(0, 3);

  return (
    <div className="w-full bg-white divide-y divide-neutral-200">
      {/* Header - Single Clean Heading */}
      <div className="p-5 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center px-1.5 py-0.5 font-bold bg-neutral-900 text-white">
              LEGAL
            </span>
            <span>/</span>
            <span>Official Regulatory Feed</span>
          </div>
          <h3 className="font-display font-bold text-2xl sm:text-3xl text-neutral-950 tracking-tight">
            Statutory Intelligence
          </h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
            Enforced legislation, judicial precedents, and regulatory notifications parsed from official gazettes.
          </p>
        </div>

        <div className="font-mono text-[11px] text-neutral-500">
          Filtered for <span className="font-bold text-neutral-950 uppercase">{activeSector}</span>
        </div>
      </div>

      {/* List of Real Statutory Acts */}
      <div className="p-5 sm:p-6 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {displayList.map((item) => {
          const isMatched =
            item.applicableSectors?.some((s) => s.toLowerCase().includes(activeSector.toLowerCase())) ?? true;

          return (
            <div
              key={item.id}
              className={`p-4.5 border flex flex-col justify-between space-y-3.5 transition-colors ${
                isMatched
                  ? 'border-neutral-900 bg-neutral-50/40 shadow-xs'
                  : 'border-neutral-200 bg-white opacity-70'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-neutral-900 bg-neutral-900 text-white">
                    {item.source === 'VAQUILL_AI'
                      ? 'Central Act'
                      : item.source === 'INDIAN_KANOON'
                      ? 'Court Precedent'
                      : 'Government Gazette'}
                  </span>

                  <span className="font-mono text-[10px] text-neutral-400">
                    {item.effectiveDate}
                  </span>
                </div>

                <h4 className="font-bold text-xs sm:text-sm text-neutral-950 leading-snug">
                  {item.actOrRuleTitle}
                </h4>

                <p className="text-[11.5px] text-neutral-600 leading-relaxed">
                  {item.summary}
                </p>

                <div className="border border-neutral-200 bg-white p-2.5 text-[11px] text-neutral-800 space-y-1">
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-neutral-500 block">
                    Financial Impact:
                  </span>
                  <p className="leading-normal">{item.cashFlowImpact}</p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-neutral-200 flex items-center justify-between text-[10.5px] font-mono text-neutral-400">
                <span className="truncate max-w-[190px]" title={item.officialCitation}>
                  {item.officialCitation}
                </span>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-900 hover:underline inline-flex items-center shrink-0 ml-2 font-sans font-bold text-[11px]"
                  >
                    <span>Read Statute</span>
                    <ExternalLink size={11} className="ml-1" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand / Collapse Button */}
      {updates.length > 3 && (
        <div className="p-3 bg-neutral-50 text-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center text-xs font-mono font-bold uppercase tracking-wider text-neutral-800 hover:text-neutral-950 cursor-pointer"
          >
            <span>{expanded ? 'Show Less' : `View All ${updates.length} Enforced Acts`}</span>
            {expanded ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
          </button>
        </div>
      )}
    </div>
  );
}
