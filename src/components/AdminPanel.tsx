import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Shield, Trash2, Users, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AdminUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_suspended: boolean;
  suspended_at: string | null;
  created_at: string;
};

type MaintenanceState = { enabled: boolean; message: string };

const GENERIC_ERROR = 'That action could not be completed. Please try again.';

function isAdminUserArray(value: unknown): value is AdminUser[] {
  return Array.isArray(value) && value.every((row) => row && typeof row === 'object' && 'user_id' in row);
}

export default function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [maintenanceDraft, setMaintenanceDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    setLoadingUsers(true);
    const { data, error: rpcError } = await supabase.rpc('admin_list_users');
    if (rpcError || !isAdminUserArray(data)) {
      if (rpcError) console.error('admin_list_users failed', rpcError);
      setError(GENERIC_ERROR);
      setUsers([]);
    } else {
      setUsers(data);
    }
    setLoadingUsers(false);
  }

  async function loadMaintenance() {
    const { data, error: queryError } = await supabase
      .from('maintenance_settings')
      .select('enabled, message')
      .eq('id', 1)
      .maybeSingle();
    if (queryError || !data) {
      if (queryError) console.error('maintenance load failed', queryError);
      setError(GENERIC_ERROR);
      return;
    }
    setMaintenance({ enabled: Boolean(data.enabled), message: String(data.message ?? '') });
    setMaintenanceDraft(String(data.message ?? ''));
  }

  useEffect(() => {
    setError(null);
    loadUsers();
    loadMaintenance();
  }, []);

  async function runUserAction(userId: string, action: () => Promise<{ error: unknown }>) {
    setBusyId(userId);
    setError(null);
    const { error: actionError } = await action();
    setBusyId(null);
    if (actionError) {
      console.error('admin action failed', actionError);
      setError(GENERIC_ERROR);
      return;
    }
    await loadUsers();
  }

  function toggleSuspended(target: AdminUser) {
    return runUserAction(target.user_id, () =>
      supabase.rpc('admin_set_suspended', { p_user_id: target.user_id, p_suspended: !target.is_suspended }),
    );
  }

  async function deleteUser(target: AdminUser) {
    setConfirmDeleteId(null);
    await runUserAction(target.user_id, () => supabase.rpc('admin_delete_user', { p_user_id: target.user_id }));
  }

  async function setMaintenanceMode(enabled: boolean) {
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_maintenance', {
      p_enabled: enabled,
      p_message: maintenanceDraft,
    });
    if (rpcError) {
      console.error('admin_set_maintenance failed', rpcError);
      setError(GENERIC_ERROR);
      return;
    }
    await loadMaintenance();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-sky-500" />
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Admin panel</h3>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[12px]">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Wrench size={13} /> Maintenance mode
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Everyone except admins sees the maintenance message instead of Bubble.
            </p>
          </div>
          <button
            onClick={() => setMaintenanceMode(!maintenance?.enabled)}
            disabled={!maintenance}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50 ${
              maintenance?.enabled
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/[0.1]'
            }`}
          >
            {maintenance?.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
        <textarea
          value={maintenanceDraft}
          onChange={(e) => setMaintenanceDraft(e.target.value)}
          rows={2}
          maxLength={300}
          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
        <button
          onClick={() => setMaintenanceMode(maintenance?.enabled ?? false)}
          disabled={!maintenance}
          className="text-[12px] font-medium text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50"
        >
          Save message
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-slate-500" />
          <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">Accounts</h4>
          <span className="text-[11px] text-slate-500">{users.length}</span>
        </div>

        {loadingUsers ? (
          <p className="text-[12px] text-slate-500">Loading accounts...</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => {
              const isSelf = u.user_id === currentUserId;
              const protectedAccount = u.is_admin || isSelf;
              return (
                <li
                  key={u.user_id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                      {u.display_name || 'No name'}
                      {u.is_admin && <span className="ml-2 text-[10px] text-sky-600 dark:text-sky-400">Admin</span>}
                      {u.is_suspended && <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">Suspended</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{u.email ?? 'No email on file'}</p>
                  </div>

                  {!protectedAccount && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleSuspended(u)}
                        disabled={busyId === u.user_id}
                        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
                        aria-label={u.is_suspended ? 'Unsuspend account' : 'Suspend account'}
                        title={u.is_suspended ? 'Unsuspend' : 'Suspend'}
                      >
                        {u.is_suspended ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                      </button>
                      {confirmDeleteId === u.user_id ? (
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={busyId === u.user_id}
                          className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 disabled:opacity-50"
                        >
                          Confirm delete
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(u.user_id)}
                          disabled={busyId === u.user_id}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                          aria-label="Delete account"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
