'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Bot, Send, User, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { askAgent, pingAgent, getAgentApiUrl } from '@/lib/agent-client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function ChatboxPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check agent availability on load
  useEffect(() => {
    let mounted = true;
    pingAgent().then((healthy) => {
      if (mounted) setIsOnline(healthy);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || loading) return;

    setInput('');
    setError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const answer = await askAgent(prompt);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsOnline(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get response from financial assistant.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const starterPrompts = [
    'What is my latest available bank balance and source date?',
    'Will I have enough money to pay staff on the 10th?',
    'Export all available transactions to CSV and calculate net cash flow with pandas.',
    'Which supplier bills or obligations are due in the next 14 days?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] sm:h-[calc(100vh-5rem)] max-w-5xl mx-auto w-full font-sans justify-between">
      
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-neutral-200 shrink-0">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="font-display font-bold text-2xl text-neutral-900 tracking-tight">
              Financial Assistant
            </h1>
            {isOnline === null ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-semibold flex items-center space-x-1">
                <RefreshCw size={10} className="animate-spin" />
                <span>Checking service...</span>
              </span>
            ) : isOnline ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center space-x-1">
                <CheckCircle2 size={11} className="text-emerald-700" />
                <span>Online (Scale to 0)</span>
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Standby</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time financial analysis backed by your DynamoDB records and isolated Python code execution.
          </p>
        </div>
        <div className="hidden sm:block text-right">
          <span className="text-[10px] text-neutral-400 block font-mono truncate max-w-[240px]" title={getAgentApiUrl()}>
            Endpoint: {getAgentApiUrl()}
          </span>
        </div>
      </header>

      {/* Message Thread Area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-xs">
              <Bot size={32} strokeWidth={1.75} />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-display font-bold text-xl text-neutral-900">
                How can I help your business today?
              </h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Ask about cash balances, upcoming vendor payables, receivables, or run automated forecasting using scientific Python.
              </p>
            </div>

            {/* Suggested Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4 text-left">
              {starterPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="p-3 bg-white border border-neutral-200/80 hover:border-neutral-900 rounded-xl text-xs text-neutral-700 font-medium transition-all hover:shadow-xs flex items-center justify-between group cursor-pointer text-left"
                >
                  <span className="leading-snug">{prompt}</span>
                  <Sparkles size={13} className="text-neutral-400 group-hover:text-amber-500 shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List */
          <div className="space-y-4 max-w-3xl mx-auto w-full px-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex space-x-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={16} />
                  </div>
                )}
                <div
                  className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] sm:max-w-[78%] ${
                    m.role === 'user'
                      ? 'bg-neutral-900 text-white rounded-br-xs'
                      : 'bg-white border border-neutral-200/80 text-neutral-800 shadow-xs rounded-bl-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                  <div
                    className={`mt-2 text-[10px] ${
                      m.role === 'user' ? 'text-neutral-400 text-right' : 'text-neutral-400'
                    }`}
                  >
                    {m.timestamp}
                  </div>
                </div>
                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking / Running State */}
            {loading && (
              <div className="flex space-x-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <Bot size={16} />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 text-neutral-600 shadow-xs text-xs flex items-center space-x-3">
                  <RefreshCw size={14} className="animate-spin text-neutral-500" />
                  <span>The financial agent is analyzing your data...</span>
                </div>
              </div>
            )}

            {/* Error Notification */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
                <div className="flex-1">
                  <span className="font-semibold block">Request Error</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-2.5 shadow-sm shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about cash flow, balances, obligations, or projections..."
            disabled={loading}
            className="w-full pl-4 pr-12 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 p-2 rounded-lg bg-neutral-900 text-white disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
            title="Send prompt to agent"
          >
            <Send size={15} />
          </button>
        </form>
        <div className="flex items-center justify-between px-2 pt-2 text-[10px] text-neutral-400">
          <span>Connected to serverless Lambda Function URL &bull; Scales to 0 when idle</span>
          <span className="font-mono">Port 8080 / AWS Lambda Web Adapter</span>
        </div>
      </div>

    </div>
  );
}
