import { unzipSync, strFromU8 } from 'fflate';
import { supabase } from './supabase';

export type ParsedMessage = { from_me: boolean; sender: string; content: string; created_at: string };
export type ParsedExport = { messages: ParsedMessage[]; otherName: string | null; otherPhone: string | null };

const LINE_RE = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(?:-|–)\s*([^:]+?):\s*([\s\S]*)$/;
const SYSTEM_RE = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(?:-|–)\s*(.+)$/;
const PHONE_RE = /\+?\d[\d\s\-().]{7,}\d/;

function parseTimestamp(d: string, mo: string, y: string, h: string, mi: string, s?: string): string | null {
  const day = parseInt(d, 10);
  const month = parseInt(mo, 10);
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  // WhatsApp exports use dd/mm/yy or mm/dd/yy depending on locale; when the
  // first number can't be a day (>12) while the second could, swap them.
  let dayN = day, monthN = month;
  if (day > 12 && month <= 12) { dayN = month; monthN = day; }
  const hour = parseInt(h, 10);
  const minute = parseInt(mi, 10);
  const sec = s ? parseInt(s, 10) : 0;
  const date = new Date(year, monthN - 1, dayN, hour, minute, sec);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function stripAmPm(timeRaw: string): { time: string; pm: boolean } {
  const m = timeRaw.toLowerCase().match(/(am|pm)/);
  return { time: timeRaw.replace(/[am⎯pm\s]/gi, ''), pm: m?.[1] === 'pm' };
}

export function parseWhatsAppText(raw: string): ParsedExport {
  const lines = raw.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  const senders = new Map<string, number>();
  let currentDate: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(LINE_RE);
    if (match) {
      const { time, pm } = stripAmPm(match[4] + ':' + match[5] + ':' + (match[6] ?? '00'));
      let ts = parseTimestamp(match[1], match[2], match[3], time.split(':')[0], time.split(':')[1], time.split(':')[2]);
      if (ts && pm) {
        const d = new Date(ts);
        d.setHours(d.getHours() + 12);
        ts = d.toISOString();
      }
      const sender = match[7].trim();
      const content = match[8];
      if (ts) {
        currentDate = ts;
        senders.set(sender, (senders.get(sender) ?? 0) + 1);
        messages.push({ from_me: false, sender, content: content.trim(), created_at: ts });
      }
      continue;
    }

    // System line without sender (e.g. "Messages and calls are end-to-end encrypted.")
    const sys = trimmed.match(SYSTEM_RE);
    if (sys && !match) {
      currentDate = parseTimestamp(sys[1], sys[2], sys[3], sys[4], sys[5], sys[6]);
      continue;
    }

    // Continuation of the previous message (multi-line)
    if (messages.length > 0 && currentDate) {
      messages[messages.length - 1].content += '\n' + trimmed;
    }
  }

  // Heuristic: the most frequent sender that is not the account owner.
  // WhatsApp exports don't label "me", so we pick the second-most-frequent
  // sender as "me" is usually the user themselves under "You" or their name.
  // Better heuristic: WhatsApp marks the owner's own messages with the label
  // "You" in newer exports; older exports use the owner's contact name.
  let otherName: string | null = null;
  const youEntry = [...senders.entries()].find(([name]) => /^you$/i.test(name));
  if (youEntry) {
    // "You" is the owner. The other person is the most frequent other sender.
    const sorted = [...senders.entries()].filter(([n]) => n !== youEntry[0]).sort((a, b) => b[1] - a[1]);
    otherName = sorted[0]?.[0] ?? null;
  } else {
    const sorted = [...senders.entries()].sort((a, b) => b[1] - a[1]);
    // Owner's label usually has fewer messages in a chat they exported to show
    // someone else, but this is ambiguous — pick the most frequent as other.
    otherName = sorted[0]?.[0] ?? null;
  }

  // Find a phone number anywhere in the export to use as the match key.
  let otherPhone: string | null = null;
  if (otherName && /[\d\s\-()+.]{7,}/.test(otherName)) {
    const p = otherName.match(PHONE_RE);
    if (p) otherPhone = p[0];
  }
  if (!otherPhone) {
    for (const m of messages) {
      const p = m.content.match(PHONE_RE);
      if (p) { otherPhone = p[0]; break; }
    }
  }

  // Mark ownership: sender label "You" is the importer.
  for (const m of messages) {
    if (/^you$/i.test(m.sender)) m.from_me = true;
  }
  if (otherName && /^you$/i.test(otherName)) otherName = null;

  return { messages, otherName, otherPhone };
}

export async function extractExportText(file: File): Promise<string> {
  if (/\.zip$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(bytes);
    const txtName = Object.keys(files).find(n => n.toLowerCase().endsWith('.txt'));
    if (!txtName) throw new Error('No chat text file found in the zip');
    return strFromU8(files[txtName]);
  }
  return file.text();
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9+]/g, '').replace(/^0+/, '');
}

export async function runImport(parsed: ParsedExport): Promise<{ conversationId: string } | { error: string }> {
  if (!parsed.otherPhone) {
    return { error: "Couldn't find a phone number in this export, so the chat can't be matched later. Make sure the chat contains the person's phone number." };
  }
  const importable = parsed.messages.filter(m => m.content.trim().length > 0);
  if (importable.length === 0) {
    return { error: 'No messages found in this export.' };
  }
  const { data, error } = await supabase.rpc('import_whatsapp_chat', {
    p_other_phone: normalizePhone(parsed.otherPhone),
    p_other_name: parsed.otherName,
    p_messages: importable.map(m => ({
      from_me: m.from_me,
      content: m.content,
      created_at: m.created_at,
    })),
  });
  if (error) return { error: 'Import failed. Try again.' };
  return { conversationId: data as string };
}
