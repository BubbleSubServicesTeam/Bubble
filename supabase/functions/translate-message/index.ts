import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese",
  ar: "Arabic", hi: "Hindi", nl: "Dutch", pl: "Polish", tr: "Turkish",
  sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", el: "Greek",
  cs: "Czech", ro: "Romanian", hu: "Hungarian", th: "Thai", vi: "Vietnamese",
  id: "Indonesian", ms: "Malay", he: "Hebrew", uk: "Ukrainian", ca: "Catalan",
};

const DEEPL_TARGETS: Record<string, string> = { en: "EN-US", pt: "PT-BR", zh: "ZH" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function translateWithDeepL(text: string, targetLang: string, apiKey: string) {
  const host = apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const resp = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: { "Authorization": `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [text], target_lang: DEEPL_TARGETS[targetLang] ?? targetLang.toUpperCase() }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const item = data?.translations?.[0];
  if (!item?.text) return null;
  return {
    translatedText: item.text as string,
    detectedLang: typeof item.detected_source_language === "string" ? item.detected_source_language.toLowerCase() : null,
  };
}

async function translateWithFreeEndpoints(text: string, targetLang: string) {
  try {
    const body = new URLSearchParams({ client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text });
    const resp = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    if (resp.ok) {
      const data = await resp.json();
      const translatedText: string = (data[0] as any[]).map((s: any) => s[0]).join("");
      if (translatedText) return { translatedText, detectedLang: typeof data[2] === "string" ? data[2] : null };
    }
  } catch {
    // fall through to the secondary service
  }
  try {
    const resp = await fetch(`https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`, { headers: { "Accept": "application/json" } });
    if (resp.ok) {
      const data = await resp.json();
      const translatedText: string = data.translation ?? "";
      if (translatedText) {
        const detected: string | undefined = data.info?.detectedSourceLang ?? data.info?.sourceLang;
        return { translatedText, detectedLang: detected ?? null };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const MAX_BATCH = 100;
const BATCH_CONCURRENCY = 8;

async function translateOne(text: string, targetLang: string) {
  const deeplKey = Deno.env.get("DEEPL_API_KEY");
  const result = deeplKey
    ? await translateWithDeepL(text, targetLang, deeplKey)
    : await translateWithFreeEndpoints(text, targetLang);
  if (!result) return null;
  const sameLanguage = !!result.detectedLang && result.detectedLang.split("-")[0] === targetLang;
  return {
    translatedText: result.translatedText,
    sameLanguage,
    detectedLang: result.detectedLang,
    detectedLangName: result.detectedLang ? (LANG_NAMES[result.detectedLang.split("-")[0]] ?? result.detectedLang) : null,
    targetLangName: LANG_NAMES[targetLang] ?? targetLang,
  };
}

async function translateMany(texts: string[], targetLang: string) {
  const results: (Awaited<ReturnType<typeof translateOne>>)[] = new Array(texts.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < texts.length) {
      const index = next++;
      results[index] = await translateOne(texts[index], targetLang);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, texts.length) }, worker));
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { targetLang } = body;
    if (!targetLang) return json({ error: "targetLang required" }, 400);

    if (Array.isArray(body.texts)) {
      const texts = body.texts.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);
      if (texts.length === 0) return json({ translations: [] });
      if (texts.length > MAX_BATCH) return json({ error: "Too many texts in one request" }, 400);
      const results = await translateMany(texts, targetLang);
      return json({ translations: results.map(r => r ? { translatedText: r.translatedText, sameLanguage: r.sameLanguage } : null) });
    }

    const { text } = body;
    if (!text) return json({ error: "text and targetLang required" }, 400);

    const result = await translateOne(text, targetLang);
    if (!result) return json({ error: "Translation service unavailable" }, 502);
    return json(result);
  } catch (err: any) {
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
