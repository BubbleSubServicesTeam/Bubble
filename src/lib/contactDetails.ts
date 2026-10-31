import { supabase } from './supabase';

export type ContactDetails = {
  phone_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export const CONTACT_DETAIL_FIELDS: { key: keyof ContactDetails; label: string }[] = [
  { key: 'phone_number', label: 'Phone' },
  { key: 'address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State / region' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

export async function fetchContactDetails(userId: string, contactId: string): Promise<ContactDetails | null> {
  const { data, error } = await supabase
    .from('contact_details')
    .select('phone_number, address, city, state, postal_code, country')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .maybeSingle();
  if (error) throw error;
  return data as ContactDetails | null;
}

export async function saveContactDetails(userId: string, contactId: string, patch: Partial<ContactDetails>): Promise<void> {
  const { error } = await supabase
    .from('contact_details')
    .upsert(
      { user_id: userId, contact_id: contactId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,contact_id' },
    );
  if (error) throw error;
}
