import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type MaintenanceStatus = { loaded: boolean; enabled: boolean; message: string };

const DEFAULT_MESSAGE = 'Sorry, Bubble is having maintenance right now. Please check back soon.';

export function useMaintenanceStatus(): MaintenanceStatus {
  const [status, setStatus] = useState<MaintenanceStatus>({ loaded: false, enabled: false, message: DEFAULT_MESSAGE });

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('maintenance_settings')
      .select('enabled, message')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          if (error) console.error('maintenance status failed', error);
          setStatus({ loaded: true, enabled: false, message: DEFAULT_MESSAGE });
          return;
        }
        setStatus({
          loaded: true,
          enabled: Boolean(data.enabled),
          message: typeof data.message === 'string' && data.message.trim() ? data.message : DEFAULT_MESSAGE,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ loaded: true, enabled: false, message: DEFAULT_MESSAGE });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
