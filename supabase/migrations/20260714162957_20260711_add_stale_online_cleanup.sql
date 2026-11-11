-- Function to mark stale online users as offline.
-- Users whose last_seen is older than 2 minutes but status is still 'online'
-- are considered stale (closed app without triggering beforeunload).
CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.profiles
  SET status = 'offline'
  WHERE status = 'online'
    AND last_seen < NOW() - INTERVAL '2 minutes';
$function$;

-- Allow authenticated users to call it (for periodic cleanup)
GRANT EXECUTE ON FUNCTION public.cleanup_stale_online_users() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_online_users() FROM anon, PUBLIC;

-- Add an index to make the cleanup query fast
CREATE INDEX IF NOT EXISTS idx_profiles_status_last_seen
  ON public.profiles (status, last_seen)
  WHERE status = 'online';
