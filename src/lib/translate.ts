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

export function flagUrl(flagCode: string): string {
  return `https://flagcdn.com/w40/${flagCode}.png`;
}

export type TranslationResult = {
  translatedText: string;
  detectedLang: string | null;
  detectedLangName: string | null;
  targetLangName: string | null;
};

const cache = new Map<string, TranslationResult>();

export async function translateText(text: string, targetLang: string): Promise<TranslationResult | null> {
  if (!text || !targetLang) return null;
  const cacheKey = `${targetLang}:${text}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token ?? '';
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-message`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ text, targetLang }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    const result: TranslationResult = {
      translatedText: data.translatedText,
      detectedLang: data.detectedLang,
      detectedLangName: data.detectedLangName,
      targetLangName: data.targetLangName,
    };
    cache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
