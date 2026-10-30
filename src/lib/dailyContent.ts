export type DailyItem = {
  kind: 'quote' | 'riddle' | 'tip';
  text: string;
  attribution?: string;
};

export const DAILY_ITEMS: DailyItem[] = [
  { kind: 'quote', text: 'The people you text at midnight are usually the ones worth keeping.', attribution: 'Anonymous' },
  { kind: 'quote', text: 'Friendship is born at the moment when one person says to another: what, you too? I thought that I was the only one.', attribution: 'C. S. Lewis' },
  { kind: 'quote', text: 'Small kindnesses, repeated daily, quietly build the strongest bonds.' },
  { kind: 'quote', text: 'Keep your circle close and your conversations honest.' },
  { kind: 'quote', text: 'The best conversations start with a question you actually want the answer to.' },
  { kind: 'quote', text: 'A good friend knows all your stories. A best friend helped write a few of them.' },
  { kind: 'quote', text: 'Listening is the quiet form of love.', attribution: 'Anonymous' },
  { kind: 'riddle', text: 'What has keys but cannot open locks?', attribution: 'Answer: a piano' },
  { kind: 'riddle', text: 'The more you take, the more you leave behind. What am I?', attribution: 'Answer: footsteps' },
  { kind: 'riddle', text: 'I speak without a mouth and hear without ears. What am I?', attribution: 'Answer: an echo' },
  { kind: 'riddle', text: 'What can you catch but not throw?', attribution: 'Answer: a cold' },
  { kind: 'riddle', text: 'What gets wetter the more it dries?', attribution: 'Answer: a towel' },
  { kind: 'riddle', text: 'What has hands but cannot clap?', attribution: 'Answer: a clock' },
  { kind: 'tip', text: 'Long-press a message on your phone to reply to it directly, or pick several to reply to only yours or only theirs.' },
  { kind: 'tip', text: 'Star a message from the action bar to keep it in your saved list, then filter the chat to see only saved messages.' },
  { kind: 'tip', text: 'Use Contact priority on a profile to keep close friends at the top of your list and quiet the chats you need a break from.' },
  { kind: 'tip', text: 'Open a chat, then the three-dot menu, to browse every photo and file shared in that conversation and download any of them.' },
  { kind: 'tip', text: 'Share your location with a friend from their profile so you can find each other faster before you meet up.' },
  { kind: 'tip', text: 'Set a different wallpaper for each chat from its menu. In a group, only the creator can change it.' },
  { kind: 'tip', text: 'Turn on Silenced for a contact to stop their unread badges and push alerts without leaving the conversation.' },
];

export function getDailyItem(date: Date, offset = 0): DailyItem {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayOfYear = Math.floor((current - start) / 86_400_000);
  return DAILY_ITEMS[(dayOfYear + offset) % DAILY_ITEMS.length];
}
