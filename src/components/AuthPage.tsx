import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, CheckCircle, Sparkles, Camera } from 'lucide-react';
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

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSuError('');
    if (!suFirstName.trim()) { setSuError('First name is required.'); return; }
    if (!suLastName.trim()) { setSuError('Last name is required.'); return; }
    if (suPassword.length < 6) { setSuError('Password must be at least 6 characters.'); return; }
    if (suPassword !== suConfirm) { setSuError('Passwords do not match.'); return; }
    setSuLoading(true);
    const { error, needsVerification, userId } = await signUp(suEmail, suPassword, suFirstName.trim(), suLastName.trim());
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
