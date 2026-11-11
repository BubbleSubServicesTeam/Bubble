import { supabase, Conversation } from './supabase';

export type ContactPriority = 'silenced' | 'normal' | 'prioritized';
export type ContactPriorityMap = Record<string, ContactPriority>;

export const CONTACT_PRIORITY_CHANGED_EVENT = 'bubble:contact-priority-changed';

const PRIORITY_RANK: Record<ContactPriority, number> = { prioritized: 0, normal: 1, silenced: 2 };

export function priorityRank(priority: ContactPriority) {
  return PRIORITY_RANK[priority];
}

export function conversationPriority(conv: Conversation, myUserId: string | undefined, priorities: ContactPriorityMap): ContactPriority {
  if (conv.is_group || conv.is_self_chat) return 'normal';
  const peer = conv.members?.find(m => m.user_id !== myUserId);
  return (peer && priorities[peer.user_id]) || 'normal';
}

export async function fetchContactPriorities(userId: string): Promise<ContactPriorityMap> {
  const { data, error } = await supabase
    .from('contact_preferences')
    .select('contact_id, priority')
    .eq('user_id', userId);
  if (error || !data) return {};
  return Object.fromEntries(data.map(row => [row.contact_id, row.priority as ContactPriority]));
}

export async function saveContactPriority(userId: string, contactId: string, priority: ContactPriority) {
  const { data: existing } = await supabase
    .from('contact_preferences')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .maybeSingle();

  const result = existing
    ? await supabase.from('contact_preferences').update({ priority, updated_at: new Date().toISOString() }).eq('id', existing.id)
    : await supabase.from('contact_preferences').insert({ user_id: userId, contact_id: contactId, priority });

  if (result.error) throw result.error;
  window.dispatchEvent(new Event(CONTACT_PRIORITY_CHANGED_EVENT));
}
