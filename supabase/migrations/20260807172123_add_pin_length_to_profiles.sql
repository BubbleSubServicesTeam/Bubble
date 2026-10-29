/*
# Add pin_length column to profiles

1. New Columns
- `profiles.pin_length` (integer, nullable). Stores the number of digits in the user's chosen PIN (e.g. 4, 6). NULL when no PIN is set.

2. Notes
- Existing users with a pin_hash but no pin_length are grandfathered: the app treats a NULL pin_length as 4 (the previous default) so their PIN keeps working.
- No RLS or policy changes needed — pin_length is updated by the owning user via the same update path as pin_hash.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_length integer;
