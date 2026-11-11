/*
# Add profile contact location fields

1. New columns on `profiles`
- `city` stores the user's city.
- `state` stores the user's state, province, or region.
- `postal_code` stores the user's postal or ZIP code.
- `country` stores the user's country.

2. Security
- The existing authenticated profile read and update policies remain in place.
- No existing contact data is removed or changed.

3. Notes
- All fields are optional.
- Privacy controls for sharing these fields will be added separately; until then, existing profile visibility rules continue to apply.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
