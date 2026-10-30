/*
# Add close friends and location privacy controls

## Summary
1. Adds `is_close_friend` boolean column to `contact_preferences` — when true,
   the contact can see the user's city/location fields on their profile.
2. Adds `location_visible` boolean column to `contact_preferences` — when true,
   the contact can see the user's live GPS location (city-level and coordinates).
   This is separate from the `location_shares` grant which controls the live map.

## Security
- Both columns are covered by existing contact_preferences RLS (auth.uid() = user_id).
- The columns default to false — no contact can see location/city unless explicitly granted.
*/

ALTER TABLE contact_preferences ADD COLUMN IF NOT EXISTS is_close_friend boolean NOT NULL DEFAULT false;
ALTER TABLE contact_preferences ADD COLUMN IF NOT EXISTS location_visible boolean NOT NULL DEFAULT false;
