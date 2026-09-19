'use client';

import React, { useState } from 'react';
import { Mic, Search, Volume2, X } from 'lucide-react';

interface VoiceSearchHeaderProps {
  onQuickSimulate?: (expense: number, delayDays: number) => void;
}

export default function VoiceSearchHeader({ onQuickSimulate }: VoiceSearchHeaderProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceReply, setVoiceReply] = useState<string | null>(null);

  const sampleVoicePrompts = [
    'Can I buy ₹50,000 new stock today?',
    'What if Sharmaji delays payment by 7 days?',
    'GST tax kab bharna hai?',
    'Show my free spendable cash',
  ];

  const handleMicToggle = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    setIsListening(true);
    setVoiceReply(null);
    setTranscript('Listening... Speak in Hindi or English (e.g. "Kya main maal khareed sakta hoon?")');

    // Simulate smart MSME vernacular recognition after 2.5s
    setTimeout(() => {
      setIsListening(false);
      const recognized = 'What if I purchase inventory worth ₹40,000 today?';
      setTranscript(recognized);
      setVoiceReply('Analysis: If you spend ₹40,000 today, your cash runway drops from 18 days to 6 days, causing a conflict with the Oct 20 GST payment. Recommendation: Defer Sharma Textiles bill by 6 days.');
      if (onQuickSimulate) {
        onQuickSimulate(40000, 0);
      }
    }, 2400);
  };

  const handlePromptClick = (text: string) => {
    setTranscript(text);
    if (text.includes('50,000')) {
      setVoiceReply('Spending ₹50,000 today will breach your bank balance before the Oct 20 GSTR-3B tax payment. Consider paying ₹25,000 now and ₹25,000 after Oct 14.');
      if (onQuickSimulate) onQuickSimulate(50000, 0);
    } else if (text.includes('Sharmaji')) {
      setVoiceReply('If Sharmaji delays payment by 7 days, your cash buffer dips by ₹35,000 on Oct 16. The solver suggests requesting a partial advance of ₹15,000 via WhatsApp.');
      if (onQuickSimulate) onQuickSimulate(0, 7);
    } else if (text.includes('GST')) {
      setVoiceReply('GSTR-3B payment of ₹42,000 is due on October 20 (13 days left). Your tax lockbox has ₹42,000 safely reserved.');
    } else {
      setVoiceReply('Your total bank balance is ₹82,350. Of this, ₹74,700 is locked for GST/TDS/PF liabilities, leaving ₹7,650 in immediately spendable cash.');
    }
  };

  return (
    <div className="w-full bg-white border border-neutral-900/10 rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Store Greeting */}
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-medium border border-neutral-200">
              Shree Ganesh Enterprises
            </span>
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight mt-1">
            Store Cash Dashboard
          </h1>
        </div>

        {/* Right: Search / Voice Input */}
        <div className="flex-1 max-w-xl">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 text-neutral-400" size={18} />
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Ask anything in simple English or Hindi (e.g., 'Can I buy stock today?')..."
              className="w-full pl-10 pr-24 py-2.5 bg-neutral-50 border border-neutral-200 rounded-full text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
            />
            <button
              onClick={handleMicToggle}
              className={`absolute right-1.5 px-3 py-1.5 rounded-full flex items-center space-x-1.5 text-xs font-medium transition-all ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse shadow-md'
                  : 'bg-neutral-900 text-white hover:bg-neutral-800'
              }`}
              title="Voice Assistant (English / Hindi)"
            >
              <Mic size={14} className={isListening ? 'animate-bounce' : ''} />
              <span className="hidden sm:inline">{isListening ? 'Listening...' : 'Voice'}</span>
            </button>
          </div>
        </div>
      </div>



      {/* Voice Assistant Reply Banner */}
      {voiceReply && (
        <div className="mt-3 p-3.5 bg-neutral-900 text-white rounded-xl flex items-start justify-between text-xs sm:text-sm animate-fadeIn">
          <div className="flex items-start space-x-2.5">
            <Volume2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-400 mr-2 font-display">FinFine Assistant:</span>
              <span className="text-neutral-200">{voiceReply}</span>
            </div>
          </div>
          <button
            onClick={() => setVoiceReply(null)}
            className="text-neutral-400 hover:text-white p-0.5 ml-2"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
