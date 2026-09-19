'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '@/components/ui/LanguageSelector';
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
} from 'aws-amplify/auth';

type AuthMode = 'signIn' | 'signUp' | 'confirmSignUp' | 'forgotPassword' | 'confirmResetPassword';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // If user is already authenticated, take them directly to the dashboard
  useEffect(() => {
    async function checkAuth() {
      try {
        await getCurrentUser();
        router.push('/dashboard');
      } catch {
        // User not logged in, stay on login page
      }
    }
    checkAuth();
  }, [router]);

  const clearMessages = () => {
    setErrorMsg('');
    setInfoMsg('');
  };

  // Format AWS Cognito errors into user-friendly messages
  const formatAuthError = (err: unknown): string => {
    if (err instanceof Error) {
      const name = err.name || '';
      const msg = err.message || '';
      if (name === 'UserAlreadyExistsException' || msg.includes('UsernameExistsException')) {
        return 'An account with this email already exists. Please sign in instead.';
      }
      if (name === 'NotAuthorizedException' || msg.includes('Incorrect username or password')) {
        return 'Incorrect email or password. Please verify your credentials.';
      }
      if (name === 'UserNotFoundException') {
        return 'No account found with this email. Please check your spelling or sign up.';
      }
      if (name === 'CodeMismatchException') {
        return 'Invalid verification code. Please check your email and try again.';
      }
      if (name === 'ExpiredCodeException') {
        return 'Verification code has expired. Please request a new code.';
      }
      if (name === 'InvalidPasswordException' || msg.includes('Password did not conform with policy')) {
        return 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.';
      }
      return msg;
    }
    return String(err);
  };

  // 1. Handle Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email || !password) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    try {
      setLoading(true);
      const result = await signIn({
        username: email.trim().toLowerCase(),
        password,
      });

      if (result.nextStep.signInStep === 'DONE') {
        router.push('/dashboard');
      } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        setInfoMsg('Please verify your email address to complete registration.');
        setMode('confirmSignUp');
      } else {
        setInfoMsg(`Additional authentication step: ${result.nextStep.signInStep}`);
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle Sign Up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email || !password) {
      setErrorMsg('Please enter your email and a secure password.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const result = await signUp({
        username: email.trim().toLowerCase(),
        password,
        options: {
          userAttributes: {
            email: email.trim().toLowerCase(),
          },
        },
      });

      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setInfoMsg(`Verification code sent to ${email}. Please check your inbox.`);
        setMode('confirmSignUp');
      } else if (result.isSignUpComplete) {
        setInfoMsg('Account created successfully! You can now sign in.');
        setMode('signIn');
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Confirm Sign Up
  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!confirmationCode) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const result = await confirmSignUp({
        username: email.trim().toLowerCase(),
        confirmationCode: confirmationCode.trim(),
      });

      if (result.isSignUpComplete) {
        setInfoMsg('Email confirmed! Logging you in...');
        // Auto-signin if password is still in state
        if (password) {
          await signIn({
            username: email.trim().toLowerCase(),
            password,
          });
          router.push('/dashboard');
        } else {
          setInfoMsg('Email confirmed! Please sign in with your password.');
          setMode('signIn');
        }
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 4. Handle Resend Verification Code
  const handleResendCode = async () => {
    clearMessages();
    try {
      setLoading(true);
      await resendSignUpCode({ username: email.trim().toLowerCase() });
      setInfoMsg(`A new verification code was sent to ${email}.`);
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 5. Handle Forgot Password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    try {
      setLoading(true);
      const result = await resetPassword({ username: email.trim().toLowerCase() });
      if (result.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
        setInfoMsg(`Password reset code sent to ${email}.`);
        setMode('confirmResetPassword');
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // 6. Handle Confirm Reset Password
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!confirmationCode || !newPassword) {
      setErrorMsg('Please enter both the reset code and your new password.');
      return;
    }

    try {
      setLoading(true);
      await confirmResetPassword({
        username: email.trim().toLowerCase(),
        confirmationCode: confirmationCode.trim(),
        newPassword,
      });
      setInfoMsg('Password reset successfully! You can now sign in with your new password.');
      setPassword(newPassword);
      setMode('signIn');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FFFFFF] text-[#111215] flex flex-col justify-between overflow-hidden select-none">
      {/* Outer Architectural Frame */}
      <div className="absolute inset-4 sm:inset-6 border border-neutral-900/15 pointer-events-none z-0">
        <div className="absolute inset-1 border border-neutral-900/10" />
      </div>

      {/* Navbar: Brand Centered + Back to Home + Language Selector */}
      <nav className="relative z-30 w-full px-6 sm:px-14 py-6 sm:py-9 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs sm:text-sm font-sans font-semibold text-neutral-800 hover:text-black px-4 py-2 rounded-full border border-neutral-300 hover:border-neutral-900 bg-white/80 backdrop-blur-sm transition-all duration-200 shadow-sm flex items-center space-x-1.5"
        >
          <span>←</span>
          <span>{t('nav.home', 'Home')}</span>
        </Link>

        <span className="font-sans font-bold text-base sm:text-lg tracking-tight text-neutral-900">
          {t('common.appName', 'FinFine Pro')}
        </span>

        <div className="flex items-center space-x-2">
          <LanguageSelector variant="compact" />
        </div>
      </nav>

      {/* Main Authentication Card */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 max-w-md mx-auto w-full my-auto py-8">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute w-[440px] h-[440px] rounded-full bg-gradient-to-b from-[#6366F1]/10 via-[#F97316]/10 to-transparent blur-3xl pointer-events-none -z-10" />

        {/* Card Container */}
        <div className="w-full bg-white/95 border border-neutral-200 shadow-[0_12px_40px_rgba(0,0,0,0.06)] rounded-3xl p-7 sm:p-9 relative z-10">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              {mode === 'signIn' && t('auth.welcomeBack', 'Welcome Back')}
              {mode === 'signUp' && t('auth.createAccount', 'Create Your Account')}
              {mode === 'confirmSignUp' && t('auth.verifyEmail', 'Verify Your Email')}
              {mode === 'forgotPassword' && t('auth.resetPassword', 'Reset Password')}
              {mode === 'confirmResetPassword' && t('auth.setNewPassword', 'Set New Password')}
            </h2>
            <p className="font-sans text-xs sm:text-sm text-neutral-500 mt-1.5">
              {mode === 'signIn' && t('auth.signInSubtitle', 'Secure access to your enterprise financial copilot')}
              {mode === 'signUp' && t('auth.signUpSubtitle', 'Start forecasting your cash runway deterministically')}
              {mode === 'confirmSignUp' && t('auth.verifySubtitle', { email, defaultValue: `Enter the 6-digit code sent to ${email}` })}
              {mode === 'forgotPassword' && t('auth.forgotSubtitle', 'Enter your email to receive a recovery code')}
              {mode === 'confirmResetPassword' && t('auth.confirmResetSubtitle', 'Enter the recovery code and your new password')}
            </p>
          </div>

          {/* Mode Switcher Tabs (Only when in signIn or signUp) */}
          {(mode === 'signIn' || mode === 'signUp') && (
            <div className="flex bg-neutral-100 p-1 rounded-full mb-6 border border-neutral-200/80">
              <button
                type="button"
                onClick={() => {
                  setMode('signIn');
                  clearMessages();
                }}
                className={`flex-1 py-1.5 rounded-full text-xs font-sans font-bold transition-all ${
                  mode === 'signIn'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {t('auth.signInTab', 'Sign In')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signUp');
                  clearMessages();
                }}
                className={`flex-1 py-1.5 rounded-full text-xs font-sans font-bold transition-all ${
                  mode === 'signUp'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {t('auth.signUpTab', 'Sign Up')}
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-sans text-red-700">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-sans text-blue-700">
              {infoMsg}
            </div>
          )}


          {/* Form 1: Sign In */}
          {mode === 'signIn' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.emailLabel', 'Email Address')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-sans font-semibold text-neutral-700">
                    {t('auth.passwordLabel', 'Password')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgotPassword');
                      clearMessages();
                    }}
                    className="text-xs font-sans text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    {t('auth.forgotPasswordLink', 'Forgot?')}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-sans"
                  >
                    {showPassword ? t('auth.hidePassword', 'Hide') : t('auth.showPassword', 'Show')}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#111215] text-white font-sans font-bold text-sm hover:bg-neutral-800 transition-all duration-200 shadow-md disabled:opacity-60 cursor-pointer mt-2"
              >
                {loading ? t('auth.signingInBtn', 'Authenticating...') : t('auth.signInBtn', 'Sign In')}
              </button>
            </form>
          )}

          {/* Form 2: Sign Up */}
          {mode === 'signUp' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.workEmailLabel', 'Work Email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.passwordLabel', 'Create Password')}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars, uppercase, symbol"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.confirmPasswordLabel', 'Confirm Password')}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <p className="text-[11px] font-sans text-neutral-400 leading-tight">
                {t('auth.passwordReqText', 'Requires minimum 8 characters with numbers, symbols, and uppercase.')}
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#111215] text-white font-sans font-bold text-sm hover:bg-neutral-800 transition-all duration-200 shadow-md disabled:opacity-60 cursor-pointer mt-2"
              >
                {loading ? t('auth.creatingAccountBtn', 'Creating Account...') : t('auth.createAccountBtn', 'Create Account')}
              </button>
            </form>
          )}

          {/* Form 3: Confirm Email Code */}
          {mode === 'confirmSignUp' && (
            <form onSubmit={handleConfirmSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.verificationCodeLabel', '6-Digit Verification Code')}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-center font-mono text-lg tracking-widest transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#111215] text-white font-sans font-bold text-sm hover:bg-neutral-800 transition-all duration-200 shadow-md disabled:opacity-60 cursor-pointer"
              >
                {loading ? t('auth.verifyingBtn', 'Verifying...') : t('auth.verifyEmailBtn', 'Verify Email & Log In')}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs font-sans">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-neutral-600 hover:text-neutral-900 font-semibold cursor-pointer"
                >
                  {t('auth.resendCodeBtn', 'Resend code')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    clearMessages();
                  }}
                  className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
                >
                  {t('auth.backToSignInBtn', 'Back to Sign In')}
                </button>
              </div>
            </form>
          )}

          {/* Form 4: Forgot Password Request */}
          {mode === 'forgotPassword' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.emailLabel', 'Registered Email Address')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#111215] text-white font-sans font-bold text-sm hover:bg-neutral-800 transition-all duration-200 shadow-md disabled:opacity-60 cursor-pointer"
              >
                {loading ? t('auth.sendingCodeBtn', 'Sending Code...') : t('auth.sendRecoveryCodeBtn', 'Send Recovery Code')}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    clearMessages();
                  }}
                  className="text-xs font-sans text-neutral-500 hover:text-neutral-900 cursor-pointer"
                >
                  {t('auth.rememberPasswordText', 'Remembered your password? Sign In')}
                </button>
              </div>
            </form>
          )}

          {/* Form 5: Confirm Password Reset */}
          {mode === 'confirmResetPassword' && (
            <form onSubmit={handleConfirmResetPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.recoveryCodeLabel', 'Recovery Code')}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-center font-mono text-base tracking-widest transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-semibold text-neutral-700 mb-1">
                  {t('auth.newPasswordLabel', 'New Password')}
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new secure password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 focus:outline-none text-sm font-sans transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#111215] text-white font-sans font-bold text-sm hover:bg-neutral-800 transition-all duration-200 shadow-md disabled:opacity-60 cursor-pointer"
              >
                {loading ? t('auth.updatingPasswordBtn', 'Updating Password...') : t('auth.saveNewPasswordBtn', 'Save New Password & Sign In')}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    clearMessages();
                  }}
                  className="text-xs font-sans text-neutral-500 hover:text-neutral-900 cursor-pointer"
                >
                  {t('auth.cancelAndSignInBtn', 'Cancel and Sign In')}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Clean Bottom Spacer */}
      <footer className="w-full py-5 text-center pointer-events-none" />
    </div>
  );
}
