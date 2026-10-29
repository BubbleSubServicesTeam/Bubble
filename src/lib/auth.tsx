import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase, Profile } from './supabase';
import { verifyFingerprint, verifyFingerprintWithPattern, type TouchPattern } from './fingerprint';
import { registerDeviceSession, updateSessionActivity } from './deviceSessions';
import type { User } from '@supabase/supabase-js';

declare global {
  interface Window {
    __bubbleInCall?: boolean;
  }
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'bubble-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const DEFAULT_PIN_LENGTH = 4;

type AuthCtx = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  pinLocked: boolean;
  pinSetupRequired: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithPassword: (password: string) => Promise<boolean>;
  unlockWithFingerprint: (pattern?: TouchPattern) => Promise<boolean>;
  bypassPin: () => void;
  lockApp: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: string | null; needsVerification: boolean; userId: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  deleteAccount: (password: string) => Promise<string | null>;
  cancelAccountDeletion: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  sendDeleteVerification: (email: string) => Promise<string | null>;
  verifyDeleteOTP: (email: string, token: string, password: string) => Promise<string | null>;
  setupPin: (pin: string, length: number) => Promise<void>;
  dismissPinSetup: () => void;
  removePin: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  changeEmail: (newEmail: string) => Promise<string | null>;
  verifyPinForSensitiveAction: (pin: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(false);
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pinStateResolved = useRef(false);
  const signedInHandled = useRef(false);
  const intentionalSignOut = useRef(false);
  const profileRef = useRef<Profile | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { userRef.current = user; }, [user]);

  async function fetchProfile(userId: string): Promise<Profile | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (data) {
          setProfile(data);
          return data;
        }

        if (error) {
          console.warn('[auth] Profile fetch error:', error.message);
        }

        // Increasing pause before retrying (trigger may not have fired yet)
        if (attempt < 4) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      } catch (err) {
        console.warn('[auth] Profile fetch failed:', err);
      }
    }
    return null;
  }

  function applyPinState(p: Profile | null) {
    if (pinStateResolved.current) return;
    pinStateResolved.current = true;
    // If user has a voluntary PIN, lock the app immediately
    if (p?.pin_hash && p?.pin_voluntary) {
      setPinLocked(true);
      try { localStorage.setItem(`bubble-has-pin-${p.user_id}`, '1'); } catch { /* ignore */ }
    } else if (p?.fingerprint_enabled && (p?.unlock_preference === 'fingerprint' || p?.unlock_preference === 'both')) {
      setPinLocked(true);
    } else {
      try { localStorage.removeItem(`bubble-has-pin-${p?.user_id ?? ''}`); } catch { /* ignore */ }
    }
  }

  const updateOnlineStatus = useCallback(async (isOnline: boolean) => {
    const u = userRef.current;
    if (!u) return;
    const cur = profileRef.current;
    // If the user chose 'auto' status, don't overwrite their status field —
    // only update last_seen. Others will see them online/offline based on last_seen.
    if (cur?.status === 'auto') {
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', u.id);
      if (cur) {
        setProfile({ ...cur, last_seen: new Date().toISOString() });
      }
      return;
    }
    await supabase
      .from('profiles')
      .update({ status: isOnline ? 'online' : 'offline', last_seen: new Date().toISOString() })
      .eq('user_id', u.id);
    if (cur) {
      setProfile({ ...cur, status: isOnline ? 'online' : 'offline', last_seen: new Date().toISOString() });
    }
  }, []);

  useEffect(() => {
    // Hard timeout: if getSession doesn't resolve in 5 seconds, show the auth screen
    const loadingTimeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(loadingTimeout);
        setUser(session?.user ?? null);
        if (session?.user) {
          signedInHandled.current = true;
          // If we know from cache this user has a PIN, keep loading until profile confirms
          let hasCachedPin = false;
          try { hasCachedPin = localStorage.getItem(`bubble-has-pin-${session.user.id}`) === '1'; } catch { /* ignore */ }
          if (!hasCachedPin) setLoading(false);
          // Safety timeout: even if fetchProfile hangs, never stay stuck on loading
          const profileTimeout = setTimeout(() => setLoading(false), 8000);
          const p = await fetchProfile(session.user.id);
          clearTimeout(profileTimeout);
          if (!p) {
            const fallback: Profile = {
              id: session.user.id,
              user_id: session.user.id,
              display_name: (session.user.email ?? '').split('@')[0] || 'Unknown',
              first_name: null,
              last_name: null,
              avatar_url: null,
              status: 'online',
              status_message: '',
              last_seen: new Date().toISOString(),
              created_at: new Date().toISOString(),
              native_language: null,
              pin_hash: null,
              pin_length: null,
              pin_voluntary: false,
              fingerprint_enabled: false,
              unlock_preference: 'pin',
              deletion_scheduled_at: null,
              deletion_cancelled_at: null,
              email: session.user.email ?? null,
              unread_badge_enabled: false,
            };
            setProfile(fallback);
          }
          applyPinState(p);
          setLoading(false);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(loadingTimeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        // On some browsers/devices, getSession() returns null on the very first
        // load because storage hasn't been read yet. INITIAL_SESSION fires with
        // the actual session shortly after. Process it if we haven't already.
        if (signedInHandled.current) return;
        if (session?.user) {
          signedInHandled.current = true;
          setUser(session.user);
          let hasCachedPin = false;
          try { hasCachedPin = localStorage.getItem(`bubble-has-pin-${session.user.id}`) === '1'; } catch { /* ignore */ }
          if (!hasCachedPin) setLoading(false);
          (async () => {
            const p = await fetchProfile(session.user.id);
            if (!p) {
              const fallback: Profile = {
                id: session.user.id,
                user_id: session.user.id,
                display_name: (session.user.email ?? '').split('@')[0] || 'Unknown',
                first_name: null,
                last_name: null,
                avatar_url: null,
                status: 'online',
                status_message: '',
                last_seen: new Date().toISOString(),
                created_at: new Date().toISOString(),
                native_language: null,
                pin_hash: null,
                pin_length: null,
                pin_voluntary: false,
                fingerprint_enabled: false,
                unlock_preference: 'pin',
                deletion_scheduled_at: null,
                deletion_cancelled_at: null,
                email: session.user.email ?? null,
                unread_badge_enabled: false,
              };
              setProfile(fallback);
            }
            applyPinState(p);
            setLoading(false);
          })();
        } else {
          // No session — show auth screen
          setLoading(false);
        }
        return;
      }
      // Only react to sign-in and sign-out events, NOT token refreshes.
      if (event === 'SIGNED_IN' && session?.user) {
        // Skip if signIn() already handled this (it sets user + loading)
        if (!signedInHandled.current) {
          signedInHandled.current = true;
          setUser(session.user);
          let hasCachedPin = false;
          try { hasCachedPin = localStorage.getItem(`bubble-has-pin-${session.user.id}`) === '1'; } catch { /* ignore */ }
          if (!hasCachedPin) setLoading(false);
          // Register this device for session tracking
          if (session.access_token) {
            registerDeviceSession(session.user.id, session.access_token).catch(() => {});
          }
          (async () => {
            const p = await fetchProfile(session.user.id);
            if (!p) {
              const fallback: Profile = {
                id: session.user.id,
                user_id: session.user.id,
                display_name: (session.user.email ?? '').split('@')[0] || 'Unknown',
                first_name: null,
                last_name: null,
                avatar_url: null,
                status: 'online',
                status_message: '',
                last_seen: new Date().toISOString(),
                created_at: new Date().toISOString(),
                native_language: null,
                pin_hash: null,
                pin_length: null,
                pin_voluntary: false,
                fingerprint_enabled: false,
                unlock_preference: 'pin',
                deletion_scheduled_at: null,
                deletion_cancelled_at: null,
                email: session.user.email ?? null,
                unread_badge_enabled: false,
              };
              setProfile(fallback);
            }
            applyPinState(p);
            setLoading(false);
          })();
        }
      } else if (event === 'SIGNED_OUT') {
        // Only do a full reset if the user explicitly signed out.
        // Transient session loss (common on iPad when tabs are suspended) should NOT
        // reset PIN state or log the user out. Attempt silent session recovery.
        if (intentionalSignOut.current) {
          signedInHandled.current = false;
          intentionalSignOut.current = false;
          setUser(null);
          setProfile(null);
          setPinLocked(false);
          pinStateResolved.current = false;
          setLoading(false);
        } else {
          // Tab was suspended and the session expired. Try to recover silently.
          supabase.auth.getSession().then(({ data: { session: recovered } }) => {
            if (recovered?.user) {
              setUser(recovered.user);
              setLoading(false);
            } else {
              signedInHandled.current = false;
              setUser(null);
              setProfile(null);
              setPinLocked(false);
              pinStateResolved.current = false;
              setLoading(false);
            }
          }).catch(() => {
            signedInHandled.current = false;
            setUser(null);
            setProfile(null);
            setPinLocked(false);
            pinStateResolved.current = false;
            setLoading(false);
          });
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Just update the user reference, don't reset loading or profile state
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(true);
        // Re-validate session silently — fixes iPad session drops without re-locking PIN
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) setUser(session.user);
        }).catch(() => {});
      } else {
        // Tab hidden (lid closed, backgrounded) — mark offline immediately
        updateOnlineStatus(false);
      }
    };

    heartbeatRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateOnlineStatus(true);
        updateSessionActivity(userRef.current?.id ?? '').catch(() => {});
      } else {
        updateOnlineStatus(false);
      }
    }, 15000);

    updateOnlineStatus(true);

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user, updateOnlineStatus]);

  async function unlockWithPin(pin: string): Promise<boolean> {
    if (!profile?.pin_hash) return false;
    const hashed = await hashPin(pin);
    if (hashed === profile.pin_hash) {
      setPinLocked(false);
      return true;
    }
    return false;
  }

  function bypassPin() {
    setPinLocked(false);
  }

  function lockApp() {
    const p = profileRef.current;
    if (!p) return;
    if (p.pin_hash && p.pin_voluntary) {
      setPinLocked(true);
    } else if (p.fingerprint_enabled && p.unlock_preference === 'fingerprint') {
      setPinLocked(true);
    }
  }

  async function unlockWithPassword(password: string): Promise<boolean> {
    if (!user?.email) return false;
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (error) return false;
    setPinLocked(false);
    return true;
  }

  async function unlockWithFingerprint(pattern?: TouchPattern): Promise<boolean> {
    if (!user?.id) return false;
    let ok: boolean;
    if (pattern) {
      ok = await verifyFingerprintWithPattern(user.id, pattern);
    } else {
      ok = await verifyFingerprint(user.id);
    }
    if (ok) setPinLocked(false);
    return ok;
  }

  async function setupPin(pin: string, length: number) {
    if (!user) return;
    const hashed = await hashPin(pin);
    const { data } = await supabase
      .from('profiles')
      .update({ pin_hash: hashed, pin_length: length, pin_voluntary: true })
      .eq('user_id', user.id)
      .select()
      .maybeSingle();
    if (data) {
      setProfile(data);
    }
  }

  function dismissPinSetup() {
    setPinSetupRequired(false);
    setPinLocked(false);
  }

  async function removePin() {
    if (!user) return;
    // Keep the pin_hash so re-enabling PIN restores the same PIN
    // Only disable the voluntary lock flag
    const { data } = await supabase
      .from('profiles')
      .update({ pin_voluntary: false })
      .eq('user_id', user.id)
      .select()
      .maybeSingle();
    if (data) setProfile(data);
  }

  async function verifyPinForSensitiveAction(pin: string): Promise<boolean> {
    if (!profile?.pin_hash) return true;
    const hashed = await hashPin(pin);
    return hashed === profile.pin_hash;
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
    if (!user?.email) return 'Not signed in';
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reAuthErr) return 'Current password is incorrect.';
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) return updateErr.message;
    return null;
  }

  async function changeEmail(newEmail: string): Promise<string | null> {
    if (!user?.email) return 'Not signed in';
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return error.message;
    return null;
  }

  async function signIn(email: string, password: string) {
    // Mark as handled BEFORE the call so onAuthStateChange doesn't double-process
    signedInHandled.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      signedInHandled.current = false;
      const msg = typeof error.message === 'string' ? error.message : String(error.message ?? 'Sign in failed');
      return msg || 'Sign in failed';
    }
    if (data.user) {
      setUser(data.user);
      let hasCachedPin = false;
      try { hasCachedPin = localStorage.getItem(`bubble-has-pin-${data.user.id}`) === '1'; } catch { /* ignore */ }
      if (!hasCachedPin) setLoading(false);
      const p = await fetchProfile(data.user.id);
      // If profile fetch failed, create a minimal profile from the user object
      if (!p) {
        const fallback: Profile = {
          id: data.user.id,
          user_id: data.user.id,
          display_name: (data.user.email ?? '').split('@')[0] || 'Unknown',
          first_name: null,
          last_name: null,
          avatar_url: null,
          status: 'online',
          status_message: '',
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
          native_language: null,
          pin_hash: null,
          pin_length: null,
          pin_voluntary: false,
          fingerprint_enabled: false,
          unlock_preference: 'pin',
          deletion_scheduled_at: null,
          deletion_cancelled_at: null,
          email: data.user.email ?? null,
        };
        setProfile(fallback);
      }
      applyPinState(p);
      setLoading(false);
      supabase
        .from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('user_id', data.user.id);
      // Register this device for session tracking
      if (data.session?.access_token) {
        registerDeviceSession(data.user.id, data.session.access_token).catch(() => {});
      }
    }
    return null;
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    const displayName = [firstName, lastName].filter(Boolean).join(' ');
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { first_name: firstName, last_name: lastName, display_name: displayName } },
    });
    if (error) {
      const msg = typeof error.message === 'string' && error.message ? error.message : 'Sign up failed';
      return { error: msg, needsVerification: false, userId: null };
    }
    const userId = data.user?.id ?? null;
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: data.user.id, display_name: displayName, first_name: firstName, last_name: lastName, status: 'auto',
      });
      if (profileError && !profileError.message.includes('duplicate')) {
        return { error: profileError.message, needsVerification: false, userId };
      }
    }
    // Sign out the auto-session from signUp, then send OTP for email verification
    if (data.session) await supabase.auth.signOut();
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    return { error: null, needsVerification: true, userId };
  }

  async function signOut() {
    intentionalSignOut.current = true;
    if (user) {
      const cur = profileRef.current;
      if (cur?.status === 'auto') {
        // Keep status as 'auto' — only update last_seen so others see offline
        await supabase.from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase.from('profiles')
          .update({ status: 'offline', last_seen: new Date().toISOString() })
          .eq('user_id', user.id);
      }
    }
    if (user) { try { localStorage.removeItem(`bubble-has-pin-${user.id}`); } catch { /* ignore */ } }
    setPinLocked(false);
    setPinSetupRequired(false);
    pinStateResolved.current = false;
    signedInHandled.current = false;
    await supabase.auth.signOut();
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!user) return;
    const patch: Record<string, any> = { ...updates };
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const fn = updates.first_name ?? profile?.first_name ?? '';
      const ln = updates.last_name ?? profile?.last_name ?? '';
      patch.display_name = [fn, ln].filter(Boolean).join(' ') || profile?.display_name;
    }
    const { data } = await supabase.from('profiles').update(patch).eq('user_id', user.id).select().maybeSingle();
    if (data) setProfile(data);
  }

  async function sendDeleteVerification(email: string) {
    const { error } = await supabase.auth.resend({ type: 'email_change', email });
    if (error) {
      const { error: err2 } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return err2?.message ?? null;
    }
    return null;
  }

  async function verifyDeleteOTP(email: string, token: string, password: string) {
    if (!user) return 'Not signed in';
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email!, password });
    if (reAuthErr) return 'Incorrect password. Please try again.';
    const { error: otpErr } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (otpErr) return 'Invalid or expired verification code.';
    await supabase.from('profiles').delete().eq('user_id', user.id);
    const { error: deleteErr } = await supabase.rpc('delete_own_account');
    if (deleteErr) { await supabase.auth.signOut(); return null; }
    await supabase.auth.signOut();
    return null;
  }

  async function deleteAccount(password: string) {
    if (!user) return 'Not signed in';
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email!, password });
    if (reAuthErr) return 'Incorrect password. Please try again.';
    // Schedule deletion for 48 hours from now instead of immediate deletion
    const deleteAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await supabase.from('profiles')
      .update({ deletion_scheduled_at: deleteAt, deletion_cancelled_at: null })
      .eq('user_id', user.id);
    await supabase.auth.signOut();
    return null;
  }

  async function cancelAccountDeletion(): Promise<void> {
    if (!user) return;
    await supabase.from('profiles')
      .update({ deletion_scheduled_at: null, deletion_cancelled_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#reset=true`,
    });
    return error?.message ?? null;
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, pinLocked, pinSetupRequired,
      unlockWithPin, unlockWithPassword, unlockWithFingerprint, bypassPin, lockApp,
      signIn, signUp, signOut, updateProfile, deleteAccount, cancelAccountDeletion,
      sendPasswordReset, sendDeleteVerification, verifyDeleteOTP,
      setupPin, dismissPinSetup, removePin, changePassword, changeEmail, verifyPinForSensitiveAction,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
