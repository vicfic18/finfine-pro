'use client';

import React from 'react';
import { MessageSquare, Sparkles, Bot, Send, CornerDownLeft } from 'lucide-react';

export default function ChatboxPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] sm:h-[calc(100vh-5rem)] max-w-5xl mx-auto w-full font-sans justify-between">
      
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-display font-bold text-2xl text-neutral-900 tracking-tight">
              FinFine Financial Assistant
            </h1>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              Online
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Ask any questions about your store&apos;s cash, taxes, invoices, or vendor negotiations.
          </p>
        </div>
      </header>

      {/* Main Empty State Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-sm">
          <Bot size={32} strokeWidth={1.75} />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display font-bold text-xl text-neutral-900">
            How can I help your business today?
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            This chat assistant connects directly to your verified bank statements and invoices. You can ask in English, Hindi, or Hinglish.
          </p>
        </div>

        {/* Suggested Starter Prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4 text-left">
          {[
            'Will I have enough money to pay staff on the 10th?',
            'What happens if I delay Sharma Textiles by 5 days?',
            'How much GST do I owe on October 20th?',
            'Draft a WhatsApp message to collect from Royal Traders',
          ].map((prompt, i) => (
            <button
              key={i}
              className="p-3 bg-white border border-neutral-200/80 hover:border-neutral-900 rounded-xl text-xs text-neutral-700 font-medium transition-all hover:shadow-xs flex items-center justify-between group"
            >
              <span>{prompt}</span>
              <Sparkles size={13} className="text-neutral-400 group-hover:text-amber-500 shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>

      {/* Empty Chat Input Box (Disabled / Ready) */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-2.5 shadow-sm">
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Type your message in English or Hindi..."
            disabled
            className="w-full pl-4 pr-12 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none cursor-not-allowed"
          />
          <button
            disabled
            className="absolute right-2 p-2 rounded-lg bg-neutral-200 text-neutral-400 cursor-not-allowed"
            title="Chatbox initialized"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between px-2 pt-2 text-[10px] text-neutral-400">
          <span>FinFine Pro AI • Connected to your DynamoDB Financial Records</span>
          <span>Tab active</span>
        </div>
      </div>

    </div>
  );
}
