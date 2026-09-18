'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, signOut, fetchUserAttributes } from 'aws-amplify/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const user = await getCurrentUser();
        // Try fetching user attributes for email
        try {
          const attributes = await fetchUserAttributes();
          setUserEmail(attributes.email || user.username || 'User');
        } catch {
          setUserEmail(user.username || 'User');
        }
      } catch {
        // Not authenticated, redirect to login
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [router]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <div className="flex items-center space-x-3 text-neutral-500 font-sans text-sm">
          <div className="w-2 h-2 rounded-full bg-neutral-900 animate-ping" />
          <span>Loading workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#111215] flex flex-col justify-between overflow-hidden select-none">
      {/* Outer Architectural Frame */}
      <div className="absolute inset-4 sm:inset-6 border border-neutral-900/15 pointer-events-none z-0">
        <div className="absolute inset-1 border border-neutral-900/10" />
      </div>

      {/* Dashboard Top Navbar */}
      <header className="relative z-30 w-full px-8 sm:px-14 py-6 sm:py-8 flex items-center justify-between border-b border-neutral-100">
        {/* Left: Brand */}
        <span className="font-sans font-bold text-base sm:text-lg tracking-tight text-neutral-900">
          FinFine Pro
        </span>

        {/* Right: Authenticated User & Sign Out */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 text-xs font-sans text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium">{userEmail}</span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs sm:text-sm font-sans font-semibold text-neutral-800 hover:text-black px-4 py-1.5 rounded-full border border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50 transition-all duration-200 shadow-sm cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Blank Dashboard Workspace */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 max-w-5xl mx-auto w-full my-auto py-16 text-center">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-b from-[#6366F1]/5 via-[#F97316]/5 to-transparent blur-3xl pointer-events-none -z-10" />

        {/* Blank Dashboard Workspace Canvas */}
        <div className="w-full max-w-2xl border border-dashed border-neutral-300 rounded-3xl p-12 sm:p-16 bg-neutral-50/50 backdrop-blur-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111215" strokeWidth="1.75">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
            Dashboard
          </h1>
          <p className="font-sans text-xs sm:text-sm text-neutral-500 mt-2 max-w-md mx-auto">
            Your workspace is active. Dashboard modules will be configured here.
          </p>
        </div>
      </main>

      {/* Clean Bottom Spacer */}
      <footer className="w-full py-4 text-center pointer-events-none" />
    </div>
  );
}
