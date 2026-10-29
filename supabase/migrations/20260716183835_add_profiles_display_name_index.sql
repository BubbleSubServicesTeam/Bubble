/*
# Add index on profiles.display_name for fast search

## Purpose
Speed up user search by display_name (ilike queries) in NewChatModal, PeopleDrawer, and GroupInfoModal.

## Changes
- New index `idx_profiles_display_name_lower` on `lower(display_name)` for case-insensitive search.
*/

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower
  ON public.profiles (lower(display_name));
