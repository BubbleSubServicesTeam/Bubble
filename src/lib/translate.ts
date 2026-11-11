import { supabase } from './supabase';

export const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'es', name: 'Spanish', flag: 'es' },
  { code: 'fr', name: 'French', flag: 'fr' },
  { code: 'de', name: 'German', flag: 'de' },
  { code: 'it', name: 'Italian', flag: 'it' },
  { code: 'pt', name: 'Portuguese', flag: 'pt' },
  { code: 'ru', name: 'Russian', flag: 'ru' },
  { code: 'ja', name: 'Japanese', flag: 'jp' },
  { code: 'ko', name: 'Korean', flag: 'kr' },
  { code: 'zh', name: 'Chinese', flag: 'cn' },
  { code: 'ar', name: 'Arabic', flag: 'sa' },
  { code: 'hi', name: 'Hindi', flag: 'in' },
  { code: 'nl', name: 'Dutch', flag: 'nl' },
  { code: 'pl', name: 'Polish', flag: 'pl' },
  { code: 'tr', name: 'Turkish', flag: 'tr' },
  { code: 'sv', name: 'Swedish', flag: 'se' },
  { code: 'no', name: 'Norwegian', flag: 'no' },
  { code: 'da', name: 'Danish', flag: 'dk' },
  { code: 'fi', name: 'Finnish', flag: 'fi' },
  { code: 'el', name: 'Greek', flag: 'gr' },
  { code: 'cs', name: 'Czech', flag: 'cz' },
  { code: 'ro', name: 'Romanian', flag: 'ro' },
  { code: 'hu', name: 'Hungarian', flag: 'hu' },
  { code: 'th', name: 'Thai', flag: 'th' },
  { code: 'vi', name: 'Vietnamese', flag: 'vn' },
  { code: 'id', name: 'Indonesian', flag: 'id' },
  { code: 'ms', name: 'Malay', flag: 'my' },
  { code: 'he', name: 'Hebrew', flag: 'il' },
  { code: 'uk', name: 'Ukrainian', flag: 'ua' },
  { code: 'ca', name: 'Catalan', flag: 'es' },
];

export function getLanguageName(code: string | null | undefined): string {
  if (!code) return '';
  const lang = LANGUAGES.find(l => l.code === code);
  return lang?.name ?? code;
}

export function getBrowserTranslationLang(): string {
  const code = (typeof navigator !== 'undefined' ? navigator.language : 'en').split('-')[0].toLowerCase();
  return LANGUAGES.some(l => l.code === code) ? code : 'en';
}

export function flagUrl(flagCode: string): string {
  return `https://flagcdn.com/w40/${flagCode}.png`;
}

export type TranslationResult = {
  translatedText: string;
  detectedLang: string | null;
  detectedLangName: string | null;
  targetLangName: string | null;
};

export type TranslationOutcome =
  | { status: 'translated'; result: TranslationResult }
  | { status: 'same-language' }
  | { status: 'error' };

type TranslatorItem = { translatedText: string; sameLanguage: boolean };

const cache = new Map<string, TranslationOutcome>();

async function postToTranslator(body: Record<string, unknown>): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? '';
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-message`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

const RETRY_DELAYS_MS = [400, 1200];

async function requestTranslation(text: string, targetLang: string): Promise<TranslationOutcome> {
  try {
    const resp = await postToTranslator({ text, targetLang });
    if (!resp.ok) return { status: 'error' };
    const data: unknown = await resp.json();
    if (!data || typeof data !== 'object' || !('translatedText' in data) || typeof data.translatedText !== 'string' || !data.translatedText.trim()) return { status: 'error' };
    const response = data as Record<string, unknown>;
    return response.sameLanguage === true
      ? { status: 'same-language' }
      : {
          status: 'translated',
          result: {
            translatedText: response.translatedText as string,
            detectedLang: typeof response.detectedLang === 'string' ? response.detectedLang : null,
            detectedLangName: typeof response.detectedLangName === 'string' ? response.detectedLangName : null,
            targetLangName: typeof response.targetLangName === 'string' ? response.targetLangName : null,
          },
        };
  } catch {
    return { status: 'error' };
  }
}

export async function translateText(text: string, targetLang: string): Promise<TranslationOutcome> {
  if (!text || !targetLang) return { status: 'error' };
  const cacheKey = `${targetLang}:${text}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const outcome = await requestTranslation(text, targetLang);
    if (outcome.status !== 'error') {
      cache.set(cacheKey, outcome);
      return outcome;
    }
    if (attempt < RETRY_DELAYS_MS.length) await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  return { status: 'error' };
}

// Returns one entry per input text: the translation, or null when the text should stay as-is
// (already in the target language) or could not be translated.
export async function translateBatch(texts: string[], targetLang: string): Promise<(string | null)[]> {
  const none = texts.map(() => null);
  if (texts.length === 0 || !targetLang) return none;
  try {
    const resp = await postToTranslator({ texts, targetLang });
    if (!resp.ok) return none;
    const data: unknown = await resp.json();
    const items = (data as { translations?: unknown })?.translations;
    if (!Array.isArray(items) || items.length !== texts.length) return none;
    return items.map((item: TranslatorItem | null) =>
      item && !item.sameLanguage && typeof item.translatedText === 'string' && item.translatedText.trim() ? item.translatedText : null
    );
  } catch {
    return none;
  }
}
