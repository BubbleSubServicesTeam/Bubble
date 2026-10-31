import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, CheckCircle, Sparkles, Camera, ChevronDown } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import KeyboardPassword from './KeyboardPassword';

type Screen = 'signin' | 'signup' | 'verify' | 'forgot' | 'forgot_sent' | 'reset';

function InputField({
  label, type = 'text', value, onChange, placeholder, autoFocus = false, children,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  autoFocus?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all duration-200"
        />
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-3">
      <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-red-400 text-[10px] font-bold">!</span>
      </div>
      <p className="text-red-400 text-[13px] leading-snug">{msg}</p>
    </div>
  );
}

function PrimaryButton({ children, loading, onClick, type = 'button', disabled }: {
  children: React.ReactNode; loading?: boolean; onClick?: () => void;
  type?: 'button' | 'submit'; disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={loading || disabled}
      className="w-full bg-sky-500 hover:bg-sky-400 active:bg-sky-600 disabled:bg-sky-500/30 disabled:cursor-not-allowed text-white font-semibold text-[15px] py-3.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20">
      {loading
        ? <BubbleLoader size={26} />
        : children}
    </button>
  );
}

export default function AuthPage() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [screen, setScreen] = useState<Screen>('signin');

  // Sign in
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siError, setSiError] = useState('');
  const [siLoading, setSiLoading] = useState(false);

  // Sign up
  const [suFirstName, setSuFirstName] = useState('');
  const [suLastName, setSuLastName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suError, setSuError] = useState('');
  const [suLoading, setSuLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // Avatar during signup
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // OTP verification
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Forgot password
  const [fpEmail, setFpEmail] = useState('');
  const [fpError, setFpError] = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  // Reset password (from email link)
  const [rpPassword, setRpPassword] = useState('');
  const [rpConfirm, setRpConfirm] = useState('');
  const [rpError, setRpError] = useState('');
  const [rpLoading, setRpLoading] = useState(false);
  const [rpDone, setRpDone] = useState(false);

  // Track which keyboard field is active (only one keyboard visible at a time)
  const [activeField, setActiveField] = useState<string | null>('siEmail');
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setSuError('Please select an image file.'); return; }
    if (f.size > 5 * 1024 * 1024) { setSuError('Image must be under 5 MB.'); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  }

  async function uploadAvatarForUser(userId: string): Promise<string | null> {
    if (!avatarFile) return null;
    setUploadingAvatar(true);
    try {
      const ext = avatarFile.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${userId}/avatar.${ext}`;
      const { error } = await supabase.storage.from('media').upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
      if (error) return null;
      const { data } = supabase.storage.from('media').getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError('');
    setSiLoading(true);
    try {
      const err = await signIn(siEmail, siPassword);
      if (err) setSiError(typeof err === 'string' && err ? err : 'Sign in failed. Please check your credentials.');
    } catch (err: any) {
      setSiError(typeof err?.message === 'string' ? err.message : 'Sign in failed. Please try again.');
    }
    setSiLoading(false);
  }

  async function handleOAuth(provider: string, displayName: string) {
    setOauthLoading(provider);
    setSiError('');
    setSuError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        setSiError(`${displayName} sign-in isn't available right now. Use email instead.`);
        setOauthLoading(null);
      }
    } catch {
      setSiError(`${displayName} sign-in isn't available right now. Use email instead.`);
      setOauthLoading(null);
    }
  }

  function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ').split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '').join(' ');
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSuError('');
    const normalizedFirstName = normalizeName(suFirstName);
    const normalizedLastName = normalizeName(suLastName);
    setSuFirstName(normalizedFirstName);
    setSuLastName(normalizedLastName);
    if (!normalizedFirstName) { setSuError('First name is required.'); return; }
    if (!normalizedLastName) { setSuError('Last name is required.'); return; }
    if (suPassword.length < 6) { setSuError('Password must be at least 6 characters.'); return; }
    if (suPassword !== suConfirm) { setSuError('Passwords do not match.'); return; }
    setSuLoading(true);
    const { error, needsVerification, userId } = await signUp(suEmail, suPassword, normalizedFirstName, normalizedLastName);
    if (error) {
      setSuError(error);
    } else {
      setVerifyEmail(suEmail);
      if (userId) setPendingUserId(userId);
      if (needsVerification) {
        setScreen('verify');
      } else {
        setScreen('signin');
      }
    }
    setSuLoading(false);
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setOtpError('');
    if (!otpCode.trim()) { setOtpError('Please enter the 6-digit code from your email.'); return; }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: verifyEmail,
        token: otpCode.trim(),
        type: 'email',
      });
      if (error) {
        setOtpError(error.message);
        setOtpLoading(false);
        return;
      }
      // Upload avatar if provided
      const uid = data.user?.id ?? pendingUserId;
      if (uid && avatarFile) {
        const avatarUrl = await uploadAvatarForUser(uid);
        if (avatarUrl) {
          await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', uid);
        }
      }
    } catch (err: any) {
      setOtpError(err.message ?? 'Verification failed');
    }
    setOtpLoading(false);
  }

  async function handleResendCode() {
    await supabase.auth.resend({ type: 'signup', email: verifyEmail });
    setOtpError('');
    setOtpCode('');
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setFpError('');
    setFpLoading(true);
    const err = await sendPasswordReset(fpEmail);
    if (err) setFpError(err);
    else setScreen('forgot_sent');
    setFpLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setRpError('');
    if (rpPassword.length < 6) { setRpError('Password must be at least 6 characters.'); return; }
    if (rpPassword !== rpConfirm) { setRpError('Passwords do not match.'); return; }
    setRpLoading(true);
    const { error } = await supabase.auth.updateUser({ password: rpPassword });
    if (error) {
      setRpError(error.message);
    } else {
      setRpDone(true);
    }
    setRpLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex flex-col items-center justify-center p-4 relative overflow-y-auto transition-colors duration-300">

      <div className="w-full max-w-[420px] relative z-10 my-auto py-6">
        {/* Heading — Bubble logo + text */}
        <div className="flex flex-col items-center mb-10">
          <img src="/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83_copy_copy_copy.jpg" alt="Bubble logo" className="w-[96px] h-[96px] rounded-[28px] shadow-xl shadow-sky-500/25 mb-4" />
          <h1 className="text-[28px] font-bold text-white tracking-tight">Bubble</h1>
          <p className="text-slate-500 mt-1 text-[14px]">
            {screen === 'signin' && 'Welcome back'}
            {screen === 'signup' && 'Create your account'}
            {screen === 'verify' && 'Check your email'}
            {screen === 'forgot' && 'Reset your password'}
            {screen === 'forgot_sent' && 'Email sent'}
            {screen === 'reset' && (rpDone ? 'Password updated' : 'Set new password')}
          </p>
        </div>

        <div className="bg-white dark:bg-white/[0.03] backdrop-blur-2xl border border-slate-200 dark:border-white/[0.07] rounded-3xl shadow-2xl overflow-y-auto max-h-[85vh] scrollbar-thin">

          {/* ──── SIGN IN ──── */}
          {screen === 'signin' && (
            <div className="p-7">
              <div className="flex bg-slate-100 dark:bg-white/[0.04] rounded-2xl p-1 mb-7 gap-1">
                <button className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-white text-slate-900 shadow-sm">Sign In</button>
                <button onClick={() => { setScreen('signup'); setSiError(''); setActiveField(null); }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  Create Account
                </button>
              </div>
              <form onSubmit={handleSignIn} className="space-y-4">
                <KeyboardPassword label="Email" value={siEmail} onChange={setSiEmail} placeholder="you@example.com" isEmail active={activeField === 'siEmail'} onActivate={() => setActiveField('siEmail')} onDismiss={() => setActiveField(null)} />
                <KeyboardPassword label="Password" value={siPassword} onChange={setSiPassword} onSubmit={() => handleSignIn({ preventDefault: () => {} } as any)} active={activeField === 'siPassword'} onActivate={() => setActiveField('siPassword')} onDismiss={() => setActiveField(null)} />
                {siError && <ErrorBox msg={siError} />}
                <PrimaryButton type="submit" loading={siLoading}>Sign In</PrimaryButton>
                <button type="button" onClick={() => { setScreen('forgot'); setFpEmail(siEmail); setFpError(''); }}
                  className="w-full text-center text-[13px] text-slate-500 hover:text-slate-300 transition-colors pt-1">
                  Forgot password?
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-white/[0.06]">
                {/* Primary OAuth providers */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => handleOAuth('google', 'Google')}
                    disabled={!!oauthLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-3 bg-white dark:bg-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.1] border border-slate-200 dark:border-white/[0.1] rounded-xl text-slate-700 dark:text-slate-200 font-medium text-[14px] transition-all disabled:opacity-50"
                  >
                    {oauthLoading === 'google' ? <BubbleLoader size={18} /> : (
                      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('github', 'GitHub')}
                    disabled={!!oauthLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-3 bg-slate-900 dark:bg-white/[0.06] hover:bg-slate-800 dark:hover:bg-white/[0.1] border border-slate-700 dark:border-white/[0.1] rounded-xl text-white dark:text-slate-200 font-medium text-[14px] transition-all disabled:opacity-50"
                  >
                    {oauthLoading === 'github' ? <BubbleLoader size={18} /> : (
                      <svg className="w-[18px] h-[18px] fill-white dark:fill-slate-200" viewBox="0 0 24 24">
                        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                      </svg>
                    )}
                    Continue with GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('apple', 'Apple')}
                    disabled={!!oauthLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-3 bg-black hover:bg-slate-900 border border-slate-800 rounded-xl text-white font-medium text-[14px] transition-all disabled:opacity-50"
                  >
                    {oauthLoading === 'apple' ? <BubbleLoader size={18} /> : (
                      <svg className="w-[18px] h-[18px] fill-white" viewBox="0 0 24 24">
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                    )}
                    Continue with Apple
                  </button>
                </div>

                {/* "Log in with something else" toggle */}
                <button
                  type="button"
                  onClick={() => setShowMoreProviders(s => !s)}
                  className="w-full flex items-center justify-center gap-1.5 mt-3 text-[13px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showMoreProviders ? 'rotate-180' : ''}`} />
                  Log in with something else
                </button>

                {showMoreProviders && (
                  <div className="grid grid-cols-2 gap-2.5 mt-3 animate-in fade-in slide-in-from-top duration-200">
                    <button
                      type="button"
                      onClick={() => handleOAuth('azure', 'Microsoft')}
                      disabled={!!oauthLoading}
                      className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-700 dark:text-slate-200 font-medium text-[13px] transition-all disabled:opacity-50"
                    >
                      {oauthLoading === 'azure' ? <BubbleLoader size={16} /> : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#F25022" d="M0 0h11.5v11.5H0z"/>
                          <path fill="#7FBA00" d="M12.5 0H24v11.5H12.5z"/>
                          <path fill="#00A4EF" d="M0 12.5h11.5V24H0z"/>
                          <path fill="#FFB900" d="M12.5 12.5H24V24H12.5z"/>
                        </svg>
                      )}
                      Microsoft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOAuth('facebook', 'Meta')}
                      disabled={!!oauthLoading}
                      className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-700 dark:text-slate-200 font-medium text-[13px] transition-all disabled:opacity-50"
                    >
                      {oauthLoading === 'facebook' ? <BubbleLoader size={16} /> : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      )}
                      Meta
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ──── SIGN UP ──── */}
          {screen === 'signup' && (
            <div className="p-7 overflow-y-auto">
              <div className="flex bg-white/[0.04] rounded-2xl p-1 mb-7 gap-1">
                <button onClick={() => { setScreen('signin'); setSuError(''); setActiveField('siEmail'); }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  Sign In
                </button>
                <button className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-white dark:bg-white text-slate-900 shadow-sm">Create Account</button>
              </div>
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Avatar picker */}
                <div className="flex flex-col items-center gap-2 pb-1">
                  <div
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative w-20 h-20 rounded-full cursor-pointer group"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="w-20 h-20 rounded-full object-cover ring-2 ring-sky-500/40" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-white/[0.06] border-2 border-dashed border-slate-300 dark:border-white/[0.15] flex flex-col items-center justify-center gap-1">
                        <Camera size={20} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-[10px] text-slate-500 dark:text-slate-600">Add photo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera size={18} className="text-white" />
                    </div>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-600">Optional profile picture</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputField label="First Name" value={suFirstName} onChange={setSuFirstName} placeholder="Alex" />
                  <InputField label="Last Name" value={suLastName} onChange={setSuLastName} placeholder="Johnson" />
                </div>
                <KeyboardPassword label="Email" value={suEmail} onChange={setSuEmail} placeholder="you@example.com" isEmail active={activeField === 'suEmail'} onActivate={() => setActiveField('suEmail')} onDismiss={() => setActiveField(null)} />
                <KeyboardPassword label="Password" value={suPassword} onChange={setSuPassword} placeholder="At least 6 characters" onSubmit={() => handleSignUp({ preventDefault: () => {} } as any)} active={activeField === 'suPassword'} onActivate={() => setActiveField('suPassword')} onDismiss={() => setActiveField(null)} />
                <KeyboardPassword label="Confirm Password" value={suConfirm} onChange={setSuConfirm} active={activeField === 'suConfirm'} onActivate={() => setActiveField('suConfirm')} onDismiss={() => setActiveField(null)} />
                {suError && <ErrorBox msg={suError} />}
                <PrimaryButton type="submit" loading={suLoading || uploadingAvatar}>
                  {uploadingAvatar ? <BubbleLoader size={22} /> : <Sparkles size={16} />}
                  Create Account
                </PrimaryButton>
                <p className="text-[12px] text-slate-500 dark:text-slate-600 text-center pt-1">
                  A verification code will be sent to your email
                </p>
              </form>

            </div>
          )}

          {/* ──── EMAIL VERIFY (OTP) ──── */}
          {screen === 'verify' && (
            <div className="p-7">
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-4">
                  <Mail size={26} className="text-sky-400" />
                </div>
                <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Verify your email</h2>
                <p className="text-slate-500 dark:text-slate-400 text-[13px] text-center">
                  We sent a 6-digit code to<br />
                  <span className="text-slate-900 dark:text-white font-semibold">{verifyEmail}</span>
                </p>
              </div>
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-400">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white text-[22px] font-mono tracking-[0.3em] text-center placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                  />
                </div>
                {otpError && <ErrorBox msg={otpError} />}
                <PrimaryButton type="submit" loading={otpLoading}>
                  <CheckCircle size={16} />
                  Verify Account
                </PrimaryButton>
              </form>
              <div className="mt-5 text-center space-y-2">
                <button onClick={handleResendCode}
                  className="text-[13px] text-sky-400 hover:text-sky-300 transition-colors">
                  Resend code
                </button>
                <br />
                <button onClick={() => setScreen('signup')}
                  className="text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
                  Use a different email
                </button>
              </div>
            </div>
          )}

          {/* ──── FORGOT PASSWORD ──── */}
          {screen === 'forgot' && (
            <div className="p-7">
              <button onClick={() => setScreen('signin')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back to sign in
              </button>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Reset password</h2>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6">Enter your email and we'll send a reset link.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <KeyboardPassword label="Email" value={fpEmail} onChange={setFpEmail} placeholder="you@example.com" isEmail onSubmit={() => handleForgotPassword({ preventDefault: () => {} } as any)} active={activeField === 'fpEmail'} onActivate={() => setActiveField('fpEmail')} onDismiss={() => setActiveField(null)} />
                {fpError && <ErrorBox msg={fpError} />}
                <PrimaryButton type="submit" loading={fpLoading}>Send Reset Link</PrimaryButton>
              </form>
            </div>
          )}

          {/* ──── FORGOT SENT ──── */}
          {screen === 'forgot_sent' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={28} className="text-green-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Check your inbox</h2>
              <p className="text-slate-500 dark:text-slate-400 text-[14px] mb-1">Reset link sent to</p>
              <p className="text-slate-900 dark:text-white font-semibold text-[15px] mb-6">{fpEmail}</p>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6">Click the link in the email to set a new password.</p>
              <PrimaryButton onClick={() => setScreen('signin')}>Back to Sign In</PrimaryButton>
            </div>
          )}
          {/* ──── RESET PASSWORD (from email link) ──── */}
          {screen === 'reset' && (
            <div className="p-7">
              {rpDone ? (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle size={28} className="text-green-400" />
                  </div>
                  <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Password updated</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px] mb-6">Your password has been changed. You can now sign in with your new password.</p>
                  <PrimaryButton onClick={() => setScreen('signin')}>Back to Sign In</PrimaryButton>
                </div>
              ) : (
                <>
                  <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Set a new password</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6">Enter your new password below.</p>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <KeyboardPassword label="New Password" value={rpPassword} onChange={setRpPassword} placeholder="At least 6 characters" active={activeField === 'rpPassword'} onActivate={() => setActiveField('rpPassword')} onDismiss={() => setActiveField(null)} />
                    <KeyboardPassword label="Confirm Password" value={rpConfirm} onChange={setRpConfirm} active={activeField === 'rpConfirm'} onActivate={() => setActiveField('rpConfirm')} onDismiss={() => setActiveField(null)} />
                    {rpError && <ErrorBox msg={rpError} />}
                    <PrimaryButton type="submit" loading={rpLoading}>Update Password</PrimaryButton>
                  </form>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
