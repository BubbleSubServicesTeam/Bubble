import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase, smartName, Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useTheme, getLogoUrl } from '../lib/theme';
import { useAppLang } from '../lib/i18n';
import { LANGUAGES, LANG_FLAGS, flagUrl } from '../lib/translate';
import Avatar from './Avatar';
import PayPalTab from './PayPalTab';
import ApiKeysTab from './ApiKeysTab';
import LocationPrivacySettings from './LocationPrivacySettings';
import NotificationPrivacySettings from './NotificationPrivacySettings';
import {
  X, Check, Camera, AlertTriangle,
  ArrowLeft, Eye, EyeOff, Mail, Trash2, User, Shield, Sun, Moon, Palette, DollarSign, Lock, Delete, Globe, ChevronDown, Ban,
  Fingerprint, Plus, KeyRound, Smartphone, Monitor, Tablet, LogOut, Code2
} from 'lucide-react';
import FingerprintScanner from './FingerprintScanner';
import { getBiometricCapability, enrollFingerprintWithPattern, listFingerprints, deleteFingerprint, FingerprintRecord, type TouchPattern } from '../lib/fingerprint';
import { listDeviceSessions, deleteDeviceSession, type DeviceSession } from '../lib/deviceSessions';
import BubbleLoader from './BubbleLoader';
import { BubbleKey } from './BubbleKey';

type Props = { onClose: () => void };
type Tab = 'profile' | 'appearance' | 'security' | 'account' | 'paypal' | 'language' | 'blocked' | 'apikeys';
type DeleteStep = 'confirm' | 'password' | 'verify_email' | 'enter_code';
type PinSetupStep = 'menu' | 'choose_length' | 'enter_new' | 'confirm_new' | 'done';
type PasswordStep = 'pin_gate' | 'form' | 'forgot_pin' | 'forgot_password' | 'email_sent' | 'done';

const statuses = [
  { value: 'auto', label: 'Auto', color: 'bg-sky-400' },
  { value: 'online', label: 'Online', color: 'bg-green-400' },
  { value: 'away', label: 'Away', color: 'bg-yellow-400' },
  { value: 'busy', label: 'Busy', color: 'bg-red-400' },
  { value: 'offline', label: 'Appear Offline', color: 'bg-slate-500' },
] as const;

export default function SettingsModal({ onClose }: Props) {
  const { user, profile, updateProfile, deleteAccount, setupPin, removePin, changePassword, changeEmail, verifyPinForSensitiveAction, sendPasswordReset } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useAppLang();
  const [tab, setTab] = useState<Tab>('profile');

  // Profile tab
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [stateRegion, setStateRegion] = useState(profile?.state ?? '');
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [statusMsg, setStatusMsg] = useState(profile?.status_message ?? '');
  const [status, setStatus] = useState(profile?.status ?? 'auto');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PIN setup flow
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetupStep, setPinSetupStep] = useState<PinSetupStep>('menu');
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [pinConfirmDigits, setPinConfirmDigits] = useState<string[]>([]);
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinLength, setPinLength] = useState(4);

  // Fingerprint management
  const [showFingerprintSetup, setShowFingerprintSetup] = useState(false);
  const [fingerprints, setFingerprints] = useState<FingerprintRecord[]>([]);
  const [bioMode, setBioMode] = useState<'touch' | 'none'>('none');
  const [enrollLabel, setEnrollLabel] = useState('');

  const [enrollError, setEnrollError] = useState('');
  const [deleteFpConfirm, setDeleteFpConfirm] = useState<FingerprintRecord | null>(null);
  const [fpLoading, setFpLoading] = useState(false);
  const [enrollStep, setEnrollStep] = useState<'list' | 'label' | 'scanning' | 'done'>('list');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestLabel, setRequestLabel] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => { getBiometricCapability().then(setBioMode); }, []);

  // Change password flows
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordStep, setPasswordStep] = useState<PasswordStep>('pin_gate');
  const [gateDigits, setGateDigits] = useState<string[]>([]);
  const [gateError, setGateError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');

  // Email change
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);

  function pinAddDigit(digit: string, forConfirm: boolean) {
    const limit = pinLength;
    if (forConfirm) {
      if (pinConfirmDigits.length >= limit) return;
      setPinConfirmDigits(d => [...d, digit]);
    } else {
      if (pinDigits.length >= limit) return;
      setPinDigits(d => [...d, digit]);
    }
  }

  function pinDeleteDigit(forConfirm: boolean) {
    if (forConfirm) {
      setPinConfirmDigits(d => d.slice(0, -1));
    } else {
      setPinDigits(d => d.slice(0, -1));
    }
    setPinError('');
  }

  async function savePinIfMatch() {
    if (pinDigits.length !== pinLength || pinConfirmDigits.length !== pinLength) return;
    if (pinDigits.join('') !== pinConfirmDigits.join('')) {
      setPinError('PINs do not match. Try again.');
      setPinConfirmDigits([]);
      setPinDigits([]);
      setPinSetupStep('enter_new');
      return;
    }
    setPinSaving(true);
    await setupPin(pinDigits.join(''), pinLength);
    setPinSaving(false);
    setPinSetupStep('done');
  }

  useEffect(() => {
    if (pinSetupStep === 'enter_new' && pinDigits.length === pinLength) {
      setPinSetupStep('confirm_new');
    }
  }, [pinDigits, pinSetupStep, pinLength]);

  useEffect(() => {
    if (pinSetupStep === 'confirm_new' && pinConfirmDigits.length === pinLength && !pinSaving) {
      savePinIfMatch();
    }
  }, [pinConfirmDigits, pinSetupStep, pinSaving, pinLength]);

  // PIN gate for password change
  async function gateAddDigit(d: string) {
    if (gateDigits.length >= (profile?.pin_length ?? 4)) return;
    const next = [...gateDigits, d];
    setGateDigits(next);
    if (next.length === (profile?.pin_length ?? 4)) {
      const ok = await verifyPinForSensitiveAction(next.join(''));
      if (ok) {
        setPasswordStep('form');
        setGateError('');
      } else {
        setGateError('Incorrect PIN. Try again.');
        setGateDigits([]);
      }
    }
  }

  function gateDeleteDigit() {
    setGateDigits(d => d.slice(0, -1));
    setGateError('');
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordSaving(true);
    const err = await changePassword(currentPassword || gateDigits.join(''), newPassword);
    setPasswordSaving(false);
    if (err) { setPasswordError(err); return; }
    setPasswordStep('done');
  }

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; blocked_id: string; profile: Profile | null }[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  async function loadBlockedUsers() {
    if (!user) return;
    setLoadingBlocked(true);
    try {
      const { data } = await supabase
        .from('user_blocks')
        .select('id, blocked_id, blocked:profiles!user_blocks_blocked_id_fkey(id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at)')
        .eq('blocker_id', user.id);
      if (data) {
        const mapped = (data as any[]).map(row => ({
          id: row.id,
          blocked_id: row.blocked_id,
          profile: row.blocked as Profile | null,
        }));
        setBlockedUsers(mapped);
      }
    } catch { /* ignore */ }
    setLoadingBlocked(false);
  }

  async function unblockUser(blockedId: string) {
    if (!user) return;
    setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blockedId));
    await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId);
  }

  // Delete account flow
  const [showDelete, setShowDelete] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('confirm');
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePass, setShowDeletePass] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOtpCode, setDeleteOtpCode] = useState('');
  const [pendingDeletePassword, setPendingDeletePassword] = useState('');

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB.'); return; }
    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('media').upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await updateProfile({ avatar_url: publicUrl });
      setAvatarPreview(publicUrl);
    } catch (err: any) {
      setAvatarError(err.message ?? 'Upload failed');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function capitalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ').split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '').join(' ');
  }

  async function handleSaveProfile() {
    const normalizedFirstName = capitalizeName(firstName);
    const normalizedLastName = capitalizeName(lastName);
    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    setSaving(true);
    await updateProfile({ first_name: normalizedFirstName, last_name: normalizedLastName, phone_number: phoneNumber.trim() || null, address: address.trim() || null, city: city.trim() || null, state: stateRegion.trim() || null, postal_code: postalCode.trim() || null, country: country.trim() || null, status_message: statusMsg, status: status as any });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 1500);
  }

  // Track whether profile fields differ from saved values
  const profileChanged = (firstName !== (profile?.first_name ?? '') ||
    lastName !== (profile?.last_name ?? '') ||
    phoneNumber !== (profile?.phone_number ?? '') ||
    address !== (profile?.address ?? '') ||
    city !== (profile?.city ?? '') ||
    stateRegion !== (profile?.state ?? '') ||
    postalCode !== (profile?.postal_code ?? '') ||
    country !== (profile?.country ?? '') ||
    statusMsg !== (profile?.status_message ?? '') ||
    status !== (profile?.status ?? 'auto'));

  // Step 1: confirm -> Step 2: enter password -> Step 3: send verify email -> Step 4: enter OTP
  async function handlePasswordConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!deletePassword.trim()) { setDeleteError('Please enter your password.'); return; }
    setDeleteError('');
    setDeleteLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user!.email!, password: deletePassword });
    if (error) { setDeleteError('Incorrect password. Please try again.'); setDeleteLoading(false); return; }
    const { error: otpErr } = await supabase.auth.signInWithOtp({ email: user!.email!, options: { shouldCreateUser: false } });
    if (otpErr) { setDeleteError('Could not send verification code: ' + otpErr.message); setDeleteLoading(false); return; }
    setPendingDeletePassword(deletePassword);
    setDeleteLoading(false);
    setDeleteStep('verify_email');
  }

  async function handleDeleteWithCode(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteOtpCode.trim()) { setDeleteError('Please enter the 6-digit code from your email.'); return; }
    setDeleteError('');
    setDeleteLoading(true);
    const { error: verifyErr } = await supabase.auth.verifyOtp({ email: user!.email!, token: deleteOtpCode.trim(), type: 'email' });
    if (verifyErr) { setDeleteError('Invalid or expired code. Please try again.'); setDeleteLoading(false); return; }
    const err = await deleteAccount(pendingDeletePassword);
    if (err) { setDeleteError(err); setDeleteLoading(false); }
  }

  function BubbleKeypad({ digits, forConfirm, length }: { digits: string[]; forConfirm: boolean; length: number }) {
    const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-center gap-3">
          {Array.from({ length }).map((_, i) => (
            <div key={i} className={`rounded-full border-2 transition-all duration-200 ${digits.length > i ? 'bg-sky-500 border-sky-500 scale-110' : 'border-slate-300 dark:border-slate-600'} ${length <= 4 ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 justify-items-center">
          {keys.map((key, idx) => {
            if (key === '') return <div key={idx} className="w-14 h-14" />;
            if (key === 'del') return (
              <button key={idx} onClick={() => pinDeleteDigit(forConfirm)}
                className="w-14 h-14 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] active:scale-90 transition-all">
                <Delete size={20} />
              </button>
            );
            return (
              <BubbleKey key={idx} value={key} onPress={() => pinAddDigit(key, forConfirm)} delay={idx * 0.12} size={56} />
            );
          })}
        </div>
      </div>
    );
  }

  const previewProfile = profile
    ? { ...profile, avatar_url: avatarPreview, first_name: firstName, last_name: lastName, status: status as any }
    : null;

  // PIN setup modal
  if (showPinSetup) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transition-colors duration-300">
          {pinSetupStep === 'menu' && (
            <div className="p-7">
              <button onClick={() => setShowPinSetup(false)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Lock size={24} className="text-sky-500" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-1">PIN Lock</h2>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6 leading-relaxed">
                      {profile?.pin_hash ? `Your app is protected by a ${profile.pin_length ?? 4}-digit PIN. You can change or remove it below.` : 'Set a PIN to lock the app. You\'ll enter it every time you open Bubble.'}
                    </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setPinDigits([]); setPinConfirmDigits([]); setPinError(''); setPinSetupStep('choose_length'); }}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20">
                  {profile?.pin_hash ? 'Change PIN' : 'Set up PIN'}
                </button>
                {profile?.pin_hash && (
                  <button onClick={async () => { await removePin(); setShowPinSetup(false); }}
                    className="w-full py-3.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 dark:text-red-400 font-medium text-[15px] rounded-xl transition-all">
                    Remove PIN
                  </button>
                )}
              </div>
            </div>
          )}

          {pinSetupStep === 'choose_length' && (
            <div className="p-7">
              <button onClick={() => setPinSetupStep('menu')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Choose PIN length</h2>
              <p className="text-slate-500 text-[13px] mb-6">How many digits do you want your PIN to be?</p>
              <div className="grid grid-cols-3 gap-3">
                {[4, 5, 6].map(n => (
                  <button key={n} onClick={() => { setPinLength(n); setPinDigits([]); setPinConfirmDigits([]); setPinError(''); setPinSetupStep('enter_new'); }}
                    className="flex flex-col items-center gap-1 py-5 rounded-2xl border-2 border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] hover:border-sky-500/50 hover:bg-sky-500/5 transition-all">
                    <span className="text-slate-900 dark:text-white font-bold text-[20px]">{n}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">digits</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pinSetupStep === 'enter_new' && (
            <div className="p-7">
              <button onClick={() => setPinSetupStep('menu')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Choose a PIN</h2>
              <p className="text-slate-500 text-[13px] mb-6">Enter a {pinLength}-digit PIN you'll remember.</p>
              {pinError && (
                <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-2.5 mb-4">
                  <p className="text-red-400 text-[13px]">{pinError}</p>
                </div>
              )}
              <BubbleKeypad digits={pinDigits} forConfirm={false} length={pinLength} />
            </div>
          )}

          {pinSetupStep === 'confirm_new' && (
            <div className="p-7">
              <button onClick={() => { setPinSetupStep('enter_new'); setPinConfirmDigits([]); }}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Confirm PIN</h2>
              <p className="text-slate-500 text-[13px] mb-6">Enter your PIN again to confirm.</p>
              {pinSaving ? (
                <div className="flex items-center justify-center py-8"><BubbleLoader size={32} /></div>
              ) : (
                <BubbleKeypad digits={pinConfirmDigits} forConfirm={true} length={pinLength} />
              )}
            </div>
          )}

          {pinSetupStep === 'done' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <Check size={28} className="text-green-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">PIN Set!</h2>
              <p className="text-slate-500 text-[14px] mb-6">Your app is now protected with a {pinLength}-digit PIN. You'll enter it every time you open Bubble.</p>
              <button onClick={() => setShowPinSetup(false)}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transition-colors duration-300">

          {passwordStep === 'pin_gate' && (
            <div className="p-7">
              <button onClick={() => setShowPasswordChange(false)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Lock size={24} className="text-sky-500" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-1">Enter your PIN</h2>
              <p className="text-slate-500 text-[13px] mb-6">Enter your PIN to unlock the password change.</p>

              <div className="flex items-center justify-center gap-3 mb-5">
                {Array.from({ length: profile?.pin_length ?? 4 }).map((_, i) => (
                  <div key={i} className={`rounded-full border-2 transition-all ${gateDigits.length > i ? 'bg-sky-500 border-sky-500 scale-110' : 'border-slate-300 dark:border-slate-600'} ${(profile?.pin_length ?? 4) <= 4 ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
                ))}
              </div>
              {gateError && (
                <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-2.5 mb-4">
                  <p className="text-red-400 text-[13px]">{gateError}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 justify-items-center">
                {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => {
                  if (key === '') return <div key={idx} className="w-14 h-14" />;
                  if (key === 'del') return (
                    <button key={idx} onClick={gateDeleteDigit}
                      className="w-14 h-14 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] active:scale-90 transition-all">
                      <Delete size={20} />
                    </button>
                  );
                  return (
                    <BubbleKey key={idx} value={key} onPress={() => gateAddDigit(key)} delay={idx * 0.12} size={56} />
                  );
                })}
              </div>
              <button onClick={() => setPasswordStep('forgot_pin')}
                className="w-full text-center text-[12px] text-slate-500 hover:text-slate-300 transition-colors mt-5">
                Forgot PIN? Use password instead
              </button>
            </div>
          )}

          {passwordStep === 'forgot_pin' && (
            <div className="p-7">
              <button onClick={() => setPasswordStep('pin_gate')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Lock size={24} className="text-sky-500" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-1">Verify it's you</h2>
              <p className="text-slate-500 text-[13px] mb-6">Enter your current password to change it.</p>
              <form onSubmit={async (e) => { e.preventDefault(); setPasswordStep('form'); }} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Current Password</label>
                  <div className="relative">
                    <input type={showNewPass ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••" autoFocus
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
                    <button type="button" onClick={() => setShowNewPass(s => !s)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showNewPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={!currentPassword.trim()}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[15px] rounded-xl transition-all">
                  Continue
                </button>
                <button type="button" onClick={async () => { if (user?.email) { await sendPasswordReset(user.email); setPasswordStep('email_sent'); } }}
                  className="w-full text-center text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
                  Forgot password? Send reset email
                </button>
              </form>
            </div>
          )}

          {passwordStep === 'form' && (
            <div className="p-7">
              <button onClick={() => setShowPasswordChange(false)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Lock size={24} className="text-sky-500" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-1">New password</h2>
              <p className="text-slate-500 text-[13px] mb-6">Choose a new password for your account.</p>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">New Password</label>
                  <div className="relative">
                    <input type={showNewPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters" autoFocus
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
                    <button type="button" onClick={() => setShowNewPass(s => !s)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showNewPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Confirm Password</label>
                  <div className="relative">
                    <input type={showConfirmPass ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
                    <button type="button" onClick={() => setShowConfirmPass(s => !s)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showConfirmPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                {passwordError && (
                  <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-2.5">
                    <p className="text-red-400 text-[13px]">{passwordError}</p>
                  </div>
                )}
                <button type="submit" disabled={passwordSaving}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2">
                  {passwordSaving ? <BubbleLoader size={26} /> : 'Update Password'}
                </button>
              </form>
            </div>
          )}

          {passwordStep === 'email_sent' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <Check size={28} className="text-green-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Check your inbox</h2>
              <p className="text-slate-500 text-[13px] mb-6">We sent a password reset link to your email. Click it to set a new password.</p>
              <button onClick={() => setShowPasswordChange(false)}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all">
                Done
              </button>
            </div>
          )}

          {passwordStep === 'done' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <Check size={28} className="text-green-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Password changed!</h2>
              <p className="text-slate-500 text-[13px] mb-6">Your password has been updated successfully.</p>
              <button onClick={() => setShowPasswordChange(false)}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showFingerprintSetup) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transition-colors duration-300 max-h-[90vh] flex flex-col">

          {/* ── List view: manage existing fingerprints ── */}
          {enrollStep === 'list' && (
            <div className="p-7 overflow-y-auto scrollbar-thin">
              <button onClick={() => setShowFingerprintSetup(false)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Fingerprint size={24} className="text-sky-500" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-slate-900 dark:text-white font-bold text-[20px]">Fingerprint Unlock</h2>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 text-[10px] font-bold uppercase tracking-wider">Beta</span>
              </div>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-5 leading-relaxed">
                {bioMode === 'none'
                  ? 'This device doesn\'t support fingerprint scanning.'
                  : <>Touchscreen scanning is in progress — press and hold the scanner circle to place your finger on the screen. Your fingerprint pattern is saved to your Bubble account, not your device.</>}
              </p>

              {/* Enable/disable toggle */}
              <button
                onClick={async () => { await updateProfile({ fingerprint_enabled: !profile?.fingerprint_enabled }); }}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border mb-4 transition-all ${
                  profile?.fingerprint_enabled
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${profile?.fingerprint_enabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                    {profile?.fingerprint_enabled && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-slate-900 dark:text-white font-medium text-[14px]">
                    {profile?.fingerprint_enabled ? 'Fingerprint unlock is ON' : 'Fingerprint unlock is OFF'}
                  </span>
                </div>
                <span className="text-[12px] text-slate-400">{profile?.fingerprint_enabled ? 'Tap to turn off' : 'Tap to turn on'}</span>
              </button>

              {/* Existing fingerprints list */}
              {fpLoading ? (
                <div className="flex justify-center py-6"><BubbleLoader size={28} /></div>
              ) : fingerprints.length > 0 ? (
                <div className="space-y-2 mb-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[12px] font-medium uppercase tracking-wide mb-2">Registered Fingerprints</p>
                  {fingerprints.map(fp => (
                    <div key={fp.id} className="flex items-center gap-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-3">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                        <Fingerprint size={16} className="text-sky-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 dark:text-white text-[14px] font-medium truncate">{fp.label}</p>
                        <p className="text-slate-400 text-[11px]">Added {new Date(fp.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        onClick={() => setDeleteFpConfirm(fp)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-all flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 mb-4">
                  <p className="text-slate-400 text-[13px]">No fingerprints registered yet.</p>
                </div>
              )}

              {/* Add fingerprint button */}
              <button
                onClick={() => { setEnrollLabel(''); setEnrollError(''); setEnrollStep('label'); }}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 mb-3"
              >
                <Plus size={18} /> Add Fingerprint
              </button>

              {/* Request from another Bubble user */}
              {!showRequestForm ? (
                <button
                  onClick={() => { setShowRequestForm(true); setRequestError(''); setRequestSent(false); }}
                  className="w-full py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-300 font-medium text-[14px] rounded-xl transition-all border border-slate-200 dark:border-white/[0.07]"
                >
                  Request a trusted contact's fingerprint
                </button>
              ) : requestSent ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <Check size={20} className="text-green-400 mx-auto mb-2" />
                  <p className="text-green-400 text-[13px] font-medium">Request sent! They'll get a notification.</p>
                  <button onClick={() => { setShowRequestForm(false); setRequestSent(false); }}
                    className="text-slate-500 text-[12px] mt-2 hover:text-slate-300 transition-colors">Close</button>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-slate-600 dark:text-slate-300 text-[13px] font-medium">Request another user's fingerprint</p>
                  <p className="text-slate-400 text-[12px] leading-relaxed">Enter their Bubble account email. If they accept, their fingerprint can unlock your account.</p>
                  <input
                    type="email"
                    value={requestEmail}
                    onChange={e => setRequestEmail(e.target.value)}
                    placeholder="their@email.com"
                    className="w-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <input
                    type="text"
                    value={requestLabel}
                    onChange={e => setRequestLabel(e.target.value)}
                    placeholder="Label (e.g. 'Spouse')"
                    className="w-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  {requestError && <p className="text-red-400 text-[12px]">{requestError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!requestEmail.trim()) { setRequestError('Enter an email address.'); return; }
                        if (requestEmail.trim().toLowerCase() === user?.email?.toLowerCase()) { setRequestError("You can't request your own fingerprint."); return; }
                        setRequestError('');
                        const { data: recipient } = await supabase
                          .from('profiles')
                          .select('user_id')
                          .eq('email', requestEmail.trim().toLowerCase())
                          .maybeSingle();
                        if (!recipient) { setRequestError('No Bubble user found with that email.'); return; }
                        const { error } = await supabase
                          .from('fingerprint_requests')
                          .insert({ requester_id: user!.id, recipient_id: recipient.user_id, label: requestLabel.trim() || 'Trusted Contact' });
                        if (error) { setRequestError('Could not send request: ' + error.message); return; }
                        setRequestSent(true);
                        setRequestEmail('');
                        setRequestLabel('');
                      }}
                      className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-medium text-[14px] rounded-lg transition-all"
                    >Send Request</button>
                    <button
                      onClick={() => { setShowRequestForm(false); setRequestError(''); setRequestEmail(''); setRequestLabel(''); }}
                      className="px-4 py-2.5 bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 font-medium text-[14px] rounded-lg transition-all"
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Label step: name the fingerprint ── */}
          {enrollStep === 'label' && (
            <div className="p-7">
              <button onClick={() => setEnrollStep('list')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-5">
                <Fingerprint size={24} className="text-sky-500" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-1">Name this fingerprint</h2>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6 leading-relaxed">
                Give it a label so you can tell it apart later (e.g. "My Thumb", "Spouse's Finger").
              </p>
              <input
                type="text"
                value={enrollLabel}
                onChange={e => setEnrollLabel(e.target.value)}
                placeholder="e.g. My Right Thumb"
                autoFocus
                maxLength={30}
                className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all mb-4"
              />
              <button
                onClick={() => { setEnrollError(''); setEnrollStep('scanning'); }}
                disabled={!enrollLabel.trim()}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20"
              >Continue</button>
            </div>
          )}

          {/* ── Scanning step: actual enrollment ── */}
          {enrollStep === 'scanning' && (
            <div className="p-7">
              <button onClick={() => setEnrollStep('label')}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-2 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1 text-center">Scan your fingerprint</h2>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6 text-center">
                Touchscreen scanning is in progress. Press and hold the circle below to place your finger on the screen for 5 seconds.
              </p>
              {enrollError && (
                <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-2.5 mb-4 text-center">
                  <p className="text-red-400 text-[13px]">{enrollError}</p>
                </div>
              )}
              <FingerprintScanner
                label={enrollLabel}
                onScanStart={async (pattern: TouchPattern) => {
                  try {
                    const fp = await enrollFingerprintWithPattern(enrollLabel, user!.id, pattern);
                    setFingerprints(prev => [...prev, fp]);
                    if (!profile?.fingerprint_enabled) {
                      await updateProfile({ fingerprint_enabled: true });
                    }
                    return true;
                  } catch (err: any) {
                    setEnrollError(err.message ?? 'Failed to save fingerprint.');
                    return false;
                  }
                }}
                onScanComplete={(success) => {
                  if (success) {
                    setEnrollStep('done');
                  }
                }}
                onCancel={() => setEnrollStep('label')}
              />
            </div>
          )}

          {/* ── Done step ── */}
          {enrollStep === 'done' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <Check size={28} className="text-green-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Fingerprint Added!</h2>
              <p className="text-slate-500 text-[14px] mb-6">"{enrollLabel}" can now unlock your Bubble app.</p>
              <button
                onClick={async () => {
                  setEnrollStep('list');
                  setFpLoading(true);
                  const fps = await listFingerprints(user!.id);
                  setFingerprints(fps);
                  setFpLoading(false);
                }}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 mb-2"
              >Back to Fingerprints</button>
              <button onClick={() => setShowFingerprintSetup(false)}
                className="w-full text-slate-500 text-[13px] hover:text-slate-300 transition-colors">Done</button>
            </div>
          )}

          {/* ── Delete confirmation overlay ── */}
          {deleteFpConfirm && (
            <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center p-6 rounded-3xl">
              <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-6 w-full shadow-2xl">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold text-[16px] text-center mb-2">Remove fingerprint?</h3>
                <p className="text-slate-500 text-[13px] text-center mb-5 leading-relaxed">
                  Are you sure you want to remove "{deleteFpConfirm.label}"? They won't be able to unlock your app with this fingerprint anymore.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteFpConfirm(null)}
                    className="flex-1 py-2.5 bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 font-medium text-[14px] rounded-lg transition-all"
                  >Cancel</button>
                  <button
                    onClick={async () => {
                      await deleteFingerprint(deleteFpConfirm.id);
                      setFingerprints(prev => prev.filter(f => f.id !== deleteFpConfirm.id));
                      setDeleteFpConfirm(null);
                    }}
                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white font-medium text-[14px] rounded-lg transition-all"
                  >Remove</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showDelete) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 dark:bg-black/70 backdrop-blur-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden transition-colors duration-300">

          {deleteStep === 'confirm' && (
            <div className="p-7">
              <button onClick={() => { setShowDelete(false); setDeleteStep('confirm'); }}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[20px] mb-2">Delete Account</h2>
              <p className="text-slate-600 dark:text-slate-400 text-[14px] mb-2 leading-relaxed">
                This will permanently delete your account, profile, messages, and all data.
                <strong className="text-slate-900 dark:text-white"> This cannot be undone.</strong>
              </p>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-8">Are you sure you want to continue?</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => setDeleteStep('password')}
                  className="w-full py-3.5 bg-red-500 hover:bg-red-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-red-500/20">
                  Yes, Delete My Account
                </button>
                <button onClick={() => setShowDelete(false)}
                  className="w-full py-3.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 font-medium text-[15px] rounded-xl transition-all border border-slate-200 dark:border-white/[0.07]">
                  No, Keep My Account
                </button>
              </div>
            </div>
          )}

          {deleteStep === 'password' && (
            <div className="p-7">
              <button onClick={() => { setDeleteStep('confirm'); setDeleteError(''); setDeletePassword(''); }}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[13px] mb-6 transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
                <Shield size={24} className="text-red-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-1">Confirm your password</h2>
              <p className="text-slate-500 dark:text-slate-500 text-[13px] mb-6">Enter your password — then we'll email you a verification code.</p>
              <form onSubmit={handlePasswordConfirm} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Password</label>
                  <div className="relative">
                    <input
                      type={showDeletePass ? 'text' : 'password'}
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      placeholder="••••••••"
                      autoFocus
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-red-500/50 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[15px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/15 transition-all"
                    />
                    <button type="button" onClick={() => setShowDeletePass(s => !s)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showDeletePass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                {deleteError && (
                  <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-3">
                    <p className="text-red-500 dark:text-red-400 text-[13px]">{deleteError}</p>
                  </div>
                )}
                <button type="submit" disabled={deleteLoading || !deletePassword.trim()}
                  className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white font-semibold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2">
                  {deleteLoading
                    ? <BubbleLoader size={26} />
                    : 'Continue'}
                </button>
              </form>
            </div>
          )}

          {deleteStep === 'verify_email' && (
            <div className="p-7">
              <div className="flex flex-col items-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-4">
                  <Mail size={26} className="text-sky-500 dark:text-sky-400" />
                </div>
                <h2 className="text-slate-900 dark:text-white font-bold text-[18px] mb-2">Check your email</h2>
                <p className="text-slate-600 dark:text-slate-400 text-[13px] text-center">
                  A 6-digit code was sent to<br />
                  <span className="text-slate-900 dark:text-white font-semibold">{user?.email}</span>
                </p>
              </div>
              <form onSubmit={handleDeleteWithCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={deleteOtpCode}
                    onChange={e => setDeleteOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-red-500/50 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white text-[22px] font-mono tracking-[0.3em] text-center placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/15 transition-all"
                  />
                </div>
                {deleteError && (
                  <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-3">
                    <p className="text-red-500 dark:text-red-400 text-[13px]">{deleteError}</p>
                  </div>
                )}
                <button type="submit" disabled={deleteLoading || deleteOtpCode.length !== 6}
                  className="w-full py-3.5 bg-red-500 hover:bg-red-400 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white font-semibold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2">
                  {deleteLoading
                    ? <BubbleLoader size={26} />
                    : <><Trash2 size={15} /> Permanently Delete Account</>}
                </button>
              </form>
              <p className="text-center text-[12px] text-slate-400 dark:text-slate-600 mt-4">
                Didn't get a code?{' '}
                <button onClick={() => { setDeleteStep('password'); setDeleteOtpCode(''); setDeleteError(''); }}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">Go back</button>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 dark:bg-black/70 backdrop-blur-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-colors duration-300">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <h2 className="text-slate-900 dark:text-white font-bold text-[18px]">Settings</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 border-b border-slate-200 dark:border-white/[0.06] px-3 py-2 flex-shrink-0">
          <button onClick={() => setTab('profile')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'profile' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <User size={15} /> {t('tabProfile')}
          </button>
          <button onClick={() => setTab('appearance')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'appearance' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Palette size={15} /> {t('tabAppearance')}
          </button>
          <button onClick={() => setTab('security')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'security' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Shield size={15} /> {t('tabSecurity')}
          </button>
          <button onClick={() => setTab('language')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'language' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Globe size={15} /> {t('tabLanguage')}
          </button>
          <button onClick={() => setTab('account')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'account' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Mail size={15} /> {t('tabAccount')}
          </button>
          <button onClick={() => setTab('paypal')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'paypal' ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <DollarSign size={15} /> {t('tabPayPal')}
          </button>
          <button onClick={() => { setTab('blocked'); loadBlockedUsers(); }}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'blocked' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Ban size={15} /> {t('tabBlocked')}
          </button>
          <button onClick={() => setTab('apikeys')}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-all ${
              tab === 'apikeys' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
            <Code2 size={15} /> {t('tabApiKeys')}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 scrollbar-thin">
          {tab === 'profile' && (
            <div className="p-6 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <Avatar profile={previewProfile} size="xl" showStatus />
                  <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    {uploadingAvatar
                      ? <BubbleLoader size={22} />
                      : <><Camera size={18} className="text-white" /><span className="text-white text-[10px] font-medium">Change</span></>
                    }
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-[12px] font-medium transition-all flex items-center gap-1.5">
                    <Camera size={11} />
                    {uploadingAvatar ? 'Uploading…' : avatarPreview ? 'Change photo' : 'Add photo'}
                  </button>
                  {avatarPreview && (
                    <button onClick={() => { updateProfile({ avatar_url: null }); setAvatarPreview(null); }}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/[0.15] rounded-lg text-red-500 dark:text-red-400 text-[12px] font-medium transition-all">
                      Remove
                    </button>
                  )}
                </div>
                {avatarError && <p className="text-red-500 dark:text-red-400 text-[12px]">{avatarError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">First Name</label>
                  <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Last Name</label>
                  <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Contact details</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Phone number', phoneNumber, setPhoneNumber],
                    ['Street address', address, setAddress],
                    ['City', city, setCity],
                    ['State / region', stateRegion, setStateRegion],
                    ['Postal / ZIP', postalCode, setPostalCode],
                    ['Country', country, setCountry],
                  ].map(([label, value, setter]) => (
                    <div key={label as string} className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-500 dark:text-slate-400">{label as string}</label>
                      <input type="text" value={value as string} onChange={e => (setter as (value: string) => void)(e.target.value)} className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">Only add details you want available on your Bubble profile.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">Status Message</label>
                <input type="text" value={statusMsg} onChange={e => setStatusMsg(e.target.value)}
                  placeholder="What's on your mind?"
                  className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">Availability</label>
                <div className="grid grid-cols-2 gap-2">
                  {statuses.map(s => (
                    <button key={s.value} onClick={() => setStatus(s.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-all ${
                        status === s.value
                          ? 'border-sky-500/40 bg-sky-500/[0.08] text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`} />
                      <span className="truncate">{s.label}</span>
                      {status === s.value && <Check size={11} className="ml-auto flex-shrink-0 text-sky-500 dark:text-sky-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleSaveProfile} disabled={saving || !profileChanged}
                className={`w-full py-3.5 font-semibold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2 ${
                  saved
                    ? 'bg-green-500/20 text-green-500 dark:text-green-400 border border-green-500/30'
                    : 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20 disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600 disabled:shadow-none disabled:cursor-not-allowed'}`}>
                {saving
                  ? <BubbleLoader size={26} />
                  : saved
                  ? <><Check size={16} /> Saved!</>
                  : 'Save Changes'}
              </button>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="p-6 space-y-5">
              <div>
                <p className="text-slate-500 dark:text-slate-500 text-xs font-medium uppercase tracking-wider mb-3">Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setTheme('light')}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                      theme === 'light'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                        : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] bg-white dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow-md">
                      <img src={getLogoUrl('light')} alt="Light logo" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Sun size={14} className="text-amber-500" />
                      <span className="text-slate-900 dark:text-white font-semibold text-[12px]">Light</span>
                    </div>
                    {theme === 'light' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => setTheme('dark')}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                      theme === 'dark'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                        : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] bg-white dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-slate-700 shadow-md">
                      <img src={getLogoUrl('dark')} alt="Dark logo" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Moon size={14} className="text-indigo-400" />
                      <span className="text-slate-900 dark:text-white font-semibold text-[12px]">Dark</span>
                    </div>
                    {theme === 'dark' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => setTheme('auto')}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                      theme === 'auto'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                        : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] bg-white dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-slate-300 dark:ring-slate-600 shadow-md flex items-center justify-center">
                      <div className="flex w-full h-full">
                        <div className="w-1/2 h-full bg-slate-100 flex items-center justify-center"><Sun size={12} className="text-amber-500" /></div>
                        <div className="w-1/2 h-full bg-slate-800 flex items-center justify-center"><Moon size={12} className="text-indigo-400" /></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-900 dark:text-white font-semibold text-[12px]">Auto</span>
                    </div>
                    {theme === 'auto' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </button>
                </div>
                {theme === 'auto' && (
                  <p className="text-slate-400 dark:text-slate-500 text-[12px] mt-2 text-center">Currently using {resolvedTheme} mode based on your device settings.</p>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                <p className="text-slate-600 dark:text-slate-400 text-[13px] leading-relaxed">
                  The app icon and logo automatically switch to match your theme. In light mode, the light logo is used. In dark mode, the dark logo takes over — including the browser tab icon and home screen icon.
                </p>
              </div>

              {/* Unread badge in tab title */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-0.5">Unread Badge in Tab</p>
                    <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">
                      Show the number of unread chats in the browser tab title, like "(3) Bubble".
                    </p>
                  </div>
                  <button
                    onClick={() => updateProfile({ unread_badge_enabled: !profile?.unread_badge_enabled })}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                      profile?.unread_badge_enabled ? 'bg-sky-500' : 'bg-slate-300 dark:bg-white/[0.12]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        profile?.unread_badge_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'account' && (
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <Mail size={16} className="text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-slate-500 dark:text-slate-500 mb-0.5">Email</p>
                    <p className="text-slate-900 dark:text-white text-[14px] font-medium truncate">{user?.email}</p>
                  </div>
                </div>
                {showEmailChange ? (
                  <div className="space-y-3">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                      placeholder="Enter new email"
                      autoFocus
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                    />
                    {emailError && <p className="text-red-500 dark:text-red-400 text-[12px]">{emailError}</p>}
                    {emailSuccess && <p className="text-green-500 dark:text-green-400 text-[12px]">Confirmation sent to your new email. Click the link to confirm.</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!newEmail.trim() || newEmail === user?.email) { setEmailError('Enter a different email.'); return; }
                          setEmailSaving(true);
                          setEmailError('');
                          setEmailSuccess(false);
                          const err = await changeEmail(newEmail.trim());
                          setEmailSaving(false);
                          if (err) { setEmailError(err); }
                          else { setEmailSuccess(true); setShowEmailChange(false); setNewEmail(''); }
                        }}
                        disabled={emailSaving || !newEmail.trim()}
                        className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-medium text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {emailSaving ? <BubbleLoader size={18} /> : 'Save Email'}
                      </button>
                      <button
                        onClick={() => { setShowEmailChange(false); setNewEmail(''); setEmailError(''); }}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-300 font-medium text-[14px] rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowEmailChange(true); setNewEmail(''); setEmailError(''); setEmailSuccess(false); }}
                    className="w-full py-2.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-medium text-[14px] rounded-xl transition-all"
                  >
                    Change Email
                  </button>
                )}
              </div>

              <div className="bg-red-500/[0.05] border border-red-500/[0.12] rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Trash2 size={16} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Delete Account</p>
                    <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">
                      Permanently delete your account. Requires password + email verification.
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowDelete(true); setDeleteStep('confirm'); }}
                  className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium text-[14px] rounded-xl transition-all">
                  Delete My Account
                </button>
              </div>

            </div>
          )}

          {tab === 'security' && (
            <div className="p-6 space-y-4">
              {/* Lock Method — tab-style switcher like auth page */}
              <div>
                <h3 className="text-slate-900 dark:text-white font-semibold text-[15px] mb-1">Lock Method</h3>
                <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed mb-4">
                  Choose how Bubble locks when you leave the app. No bypass — you must unlock with your chosen method every time.
                </p>
                <div className="flex bg-slate-100 dark:bg-white/[0.04] rounded-2xl p-1 gap-1 mb-4">
                  <button
                    onClick={async () => {
                      if (profile?.pin_hash && profile?.pin_voluntary) { await removePin(); }
                      if (profile?.fingerprint_enabled) { await updateProfile({ fingerprint_enabled: false }); }
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      !(profile?.pin_hash && profile?.pin_voluntary) && !profile?.fingerprint_enabled
                        ? 'bg-white dark:bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Shield size={14} />
                    No Lock
                  </button>
                  <button
                    onClick={async () => {
                      if (profile?.fingerprint_enabled && !profile?.pin_hash) {
                        updateProfile({ fingerprint_enabled: false });
                      }
                      if (profile?.pin_hash) {
                        if (profile?.pin_voluntary) {
                          // PIN already active — show management menu
                          setShowPinSetup(true); setPinSetupStep('menu'); setPinError(''); setPinDigits([]); setPinConfirmDigits([]);
                        } else {
                          // PIN exists but disabled — re-enable it with the same PIN
                          await updateProfile({ pin_voluntary: true });
                        }
                      } else {
                        // No PIN set up yet — start fresh
                        setShowPinSetup(true); setPinSetupStep('choose_length'); setPinError(''); setPinDigits([]); setPinConfirmDigits([]);
                      }
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      profile?.pin_hash && profile?.pin_voluntary
                        ? 'bg-white dark:bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Lock size={14} />
                    PIN
                  </button>
                  <button
                    onClick={async () => {
                      if (bioMode === 'none') return;
                      if (profile?.fingerprint_enabled) {
                        setShowFingerprintSetup(true);
                        setEnrollLabel(''); setEnrollError('');
                        setFpLoading(true);
                        const fps = await listFingerprints(user!.id);
                        setFingerprints(fps);
                        setFpLoading(false);
                      } else {
                        await updateProfile({ fingerprint_enabled: true, unlock_preference: 'fingerprint' });
                        setShowFingerprintSetup(true);
                        setEnrollLabel(''); setEnrollError('');
                        setFpLoading(true);
                        const fps = await listFingerprints(user!.id);
                        setFingerprints(fps);
                        setFpLoading(false);
                      }
                    }}
                    disabled={bioMode === 'none'}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      profile?.fingerprint_enabled
                        ? 'bg-white dark:bg-white text-slate-900 shadow-sm'
                        : bioMode === 'none'
                          ? 'text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Fingerprint size={14} />
                    Fingerprint
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 text-[9px] font-bold uppercase tracking-wider">Beta</span>
                  </button>
                </div>

                {/* Status text for active lock method */}
                {!(profile?.pin_hash && profile?.pin_voluntary) && !profile?.fingerprint_enabled && (
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">No lock is active. The app opens without unlocking.</p>
                )}
                {profile?.pin_hash && profile?.pin_voluntary && (
                  <p className="text-[12px] text-sky-500 dark:text-sky-400 mb-3">PIN is active ({profile.pin_length ?? 4}-digit). Tap the PIN tab to manage or change it.</p>
                )}
                {profile?.fingerprint_enabled && !profile?.pin_hash && (
                  <p className="text-[12px] text-sky-500 dark:text-sky-400 mb-3">Fingerprint lock is active. Tap the Fingerprint tab to manage enrolled fingerprints.</p>
                )}
                {profile?.fingerprint_enabled && profile?.pin_hash && (
                  <p className="text-[12px] text-sky-500 dark:text-sky-400 mb-3">Both PIN and Fingerprint are active. You can use either to unlock.</p>
                )}
              </div>

              {/* Active Devices */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Smartphone size={16} className="text-sky-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Active Devices</p>
                    <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">Devices currently logged into your Bubble account.</p>
                  </div>
                </div>
                <SessionsList />
              </div>

              {/* Fingerprint management (shown when fingerprint is enabled) */}
              {profile?.fingerprint_enabled && bioMode === 'touch' && (
                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Fingerprint size={16} className="text-sky-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Manage Fingerprints</p>
                      <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">
                        {fingerprints.length > 0 ? `${fingerprints.length} fingerprint(s) saved.` : 'No fingerprints enrolled yet.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setShowFingerprintSetup(true);
                      setEnrollLabel(''); setEnrollError('');
                      setFpLoading(true);
                      const fps = await listFingerprints(user!.id);
                      setFingerprints(fps);
                      setFpLoading(false);
                    }}
                    className="w-full py-2.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-medium text-[14px] rounded-xl transition-all mb-3">
                    Manage Fingerprints{fingerprints.length > 0 ? ` (${fingerprints.length})` : ''}
                  </button>

                  {/* Unlock preference */}
                  {fingerprints.length > 0 && (
                    <div className="bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3 space-y-2">
                      <p className="text-slate-600 dark:text-slate-300 text-[12px] font-medium uppercase tracking-wide">Unlock Method</p>
                      {([
                        { value: 'pin', label: 'PIN (fingerprint optional)' },
                        { value: 'both', label: 'PIN or Fingerprint' },
                        { value: 'fingerprint', label: 'Fingerprint only' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          onClick={async () => { await updateProfile({ unlock_preference: opt.value }); }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                            (profile?.unlock_preference ?? 'pin') === opt.value
                              ? 'bg-sky-500 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06]'
                          }`}>
                          <span className="flex items-center gap-2">
                            {opt.value === 'pin' && <KeyRound size={14} />}
                            {opt.value === 'fingerprint' && <Fingerprint size={14} />}
                            {opt.value === 'both' && <Shield size={14} />}
                            {opt.label}
                          </span>
                          {(profile?.unlock_preference ?? 'pin') === opt.value && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Change Password */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lock size={16} className="text-sky-500" />
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Password</p>
                    <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">
                      Change your account password. Requires your PIN to unlock.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowPasswordChange(true); setPasswordStep('pin_gate'); setGateDigits([]); setGateError(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                  className="w-full py-2.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-medium text-[14px] rounded-xl transition-all">
                  Change Password
                </button>
              </div>

              <LocationPrivacySettings />
              <NotificationPrivacySettings />
            </div>
          )}

          {tab === 'blocked' && (
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Ban size={18} className="text-sky-500" />
                <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Blocked People</h3>
              </div>
              {loadingBlocked ? (
                <div className="flex justify-center py-12"><BubbleLoader size={32} /></div>
              ) : blockedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                    <Ban size={22} className="text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[14px]">You haven't blocked anyone.</p>
                </div>
              ) : (
                blockedUsers.map(b => (
                  <div key={b.id} className="flex items-center gap-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-3">
                    {b.profile ? (
                      <Avatar profile={b.profile} size="sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/[0.08] flex items-center justify-center">
                        <User size={16} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 dark:text-white text-[14px] font-medium truncate">
                        {b.profile ? smartName(b.profile) : 'Unknown user'}
                      </p>
                    </div>
                    <button
                      onClick={() => unblockUser(b.blocked_id)}
                      className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center text-white transition-all shadow-lg shadow-green-500/20"
                      title="Unblock"
                    >
                      <Check size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'paypal' && user && <PayPalTab userId={user.id} />}

          {tab === 'apikeys' && user && <ApiKeysTab userId={user.id} />}

          {tab === 'language' && (
            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={16} className="text-sky-500" />
                  <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Your Language</h3>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed mb-4">
                  Choose your native language. The entire app will use it, and messages you receive in other languages will be automatically translated.
                </p>
                <LanguagePicker
                  value={profile?.native_language ?? ''}
                  onChange={async (lang) => { await updateProfile({ native_language: lang || null }); }}
                />
              </div>

              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check size={13} className="text-sky-500" />
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-medium text-[13px]">Auto-Translation</p>
                    <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed mt-0.5">Messages in other languages are translated automatically. You'll see "Auto-translated from [language]" and can tap to view the original.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionsList() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const data = await listDeviceSessions(user.id);
    setSessions(data);
    setLoading(false);
  }

  async function handleRemove(sessionId: string) {
    setRemovingId(sessionId);
    const ok = await deleteDeviceSession(sessionId);
    if (ok) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    }
    setRemovingId(null);
  }

  function getDeviceIcon(deviceType: string): typeof Smartphone {
    if (/iPad|Tablet/i.test(deviceType)) return Tablet;
    if (/iPhone|Android Phone|Mobile/i.test(deviceType)) return Smartphone;
    return Monitor;
  }

  function formatLastActive(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return 'Active now';
    if (diffMin < 60) return `Active ${diffMin}m ago`;
    if (diffHr < 24) return `Active ${diffHr}h ago`;
    if (diffDay === 1) return `Active 1 day ago`;
    if (diffDay < 7) return `Active ${diffDay} days ago`;
    return `Active ${d.toLocaleDateString()}`;
  }

  if (loading) {
    return <div className="flex justify-center py-4"><BubbleLoader size={24} /></div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-slate-400 text-[13px]">No devices found. Devices will appear here when you log in from them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map(s => {
        const Icon = getDeviceIcon(s.device_type);
        return (
          <div key={s.id} className="flex items-center gap-3 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
              <Icon size={15} className="text-sky-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-900 dark:text-white text-[13px] font-medium">
                {s.device_type}
                {s.is_current && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">This device</span>}
              </p>
              <p className="text-slate-400 text-[11px]">{s.browser} · {s.os} · {formatLastActive(s.last_active_at)}</p>
            </div>
            {!s.is_current && (
              <button
                onClick={() => handleRemove(s.id)}
                disabled={removingId === s.id}
                className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-all flex-shrink-0 disabled:opacity-50"
                title="Sign out this device"
              >
                {removingId === s.id ? <BubbleLoader size={14} /> : <LogOut size={14} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LanguagePicker({ value, onChange }: { value: string; onChange: (lang: string) => void }) {
  const { t } = useAppLang();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = LANGUAGES.find(l => l.code === value);
  const filtered = LANGUAGES.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  function handleOpen() {
    if (btnRef.current) {
      setBtnRect(btnRef.current.getBoundingClientRect());
    }
    setOpen(o => !o);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-full flex items-center justify-between bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Globe size={15} className="text-sky-500" />
          {current ? (
            <span className="flex items-center gap-2">
              <img src={flagUrl(current.flag)} alt={current.name} className="w-5 h-3.5 rounded-[2px] object-cover" />
              {current.name}
            </span>
          ) : <span className="text-slate-400">{t('languageNotSet')}</span>}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && btnRect && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => { setOpen(false); setSearch(''); }} />
          <div
            className="fixed z-[210] bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            style={{
              left: Math.min(btnRect.left, window.innerWidth - 380 - 16),
              top: Math.min(btnRect.bottom + 8, window.innerHeight - 300),
              width: Math.min(btnRect.width, 380),
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search languages..."
                className="w-full bg-slate-100 dark:bg-white/[0.06] border-0 rounded-lg px-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin py-1">
              <button
                onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-all ${!value ? 'text-sky-500 bg-sky-500/10' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}
              >
                <span className="w-5 text-center">—</span>
                {t('languageNotSet')}
                {!value && <Check size={14} className="ml-auto" />}
              </button>
              {filtered.map(l => (
                <button
                  key={l.code}
                  onClick={() => { onChange(l.code); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-all ${value === l.code ? 'text-sky-500 bg-sky-500/10' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}
                >
                  <span className="w-5 flex justify-center"><img src={flagUrl(l.flag)} alt={l.name} className="w-5 h-3.5 rounded-[2px] object-cover" /></span>
                  {l.name}
                  {value === l.code && <Check size={14} className="ml-auto" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-slate-400 text-[13px] py-4">No languages found</p>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
