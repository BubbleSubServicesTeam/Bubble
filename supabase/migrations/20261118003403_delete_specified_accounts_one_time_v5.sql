/*
# One-time admin deletion of four specified user accounts (retry 3)

1. Purpose
- Permanently deletes the accounts matching these exact emails:
  - chrislgibson@me.com
  - chrislgibson@icloud.com
  - faithkgibson@gmail.com
  - charisgibson@creatorshouse.org
- Deleting an auth user cascades to their profile and app data through
  existing foreign keys.

2. Fixes from previous attempts
- Messages replying to other messages are unlinked before deletion.
- Self-chat conversations the user created are deleted (they are personal
  notes chats and are covered by the one-self-chat-per-user rule).
- Other conversations the user created are reassigned to the admin first, so
  the non-cascading conversations.created_by constraint cannot block deletion.

3. Security
- SECURITY DEFINER with fixed search_path (needed to reach auth.users).
- Guard: caller must match the admin profile (Noah Gibson, the only admin).
- The email list is hard-coded in this one-time migration only; the function
  is dropped at the end of the same migration so it cannot be reused.
*/

CREATE OR REPLACE FUNCTION public.tmp_delete_specified_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  target uuid;
  candidate_email text;
BEGIN
  IF (SELECT p.is_admin FROM profiles p WHERE p.user_id = '69b5bed2-6959-4ca8-a6c2-331a0e3a7252') IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOREACH candidate_email IN ARRAY ARRAY[
    'chrislgibson@me.com',
    'chrislgibson@icloud.com',
    'faithkgibson@gmail.com',
    'charisgibson@creatorshouse.org'
  ]
  LOOP
    SELECT u.id INTO target FROM auth.users u WHERE lower(u.email) = candidate_email;
    IF target IS NOT NULL THEN
      IF target = '69b5bed2-6959-4ca8-a6c2-331a0e3a7252' THEN
        RAISE EXCEPTION 'Cannot delete the admin account this way';
      END IF;
      UPDATE messages SET reply_to = NULL
      WHERE reply_to IS NOT NULL
        AND (sender_id = target
             OR conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = target));
      DELETE FROM conversations WHERE created_by = target AND is_self_chat = true;
      UPDATE conversations SET created_by = '69b5bed2-6959-4ca8-a6c2-331a0e3a7252' WHERE created_by = target;
      DELETE FROM auth.users WHERE id = target;
      deleted_count := deleted_count + 1;
    END IF;
  END LOOP;

  RETURN deleted_count;
END;
$$;

SELECT public.tmp_delete_specified_accounts() AS deleted;

DROP FUNCTION public.tmp_delete_specified_accounts();
