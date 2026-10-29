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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, targetLang } = await req.json();
    if (!text || !targetLang) {
      return new Response(JSON.stringify({ error: "text and targetLang required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceLang = "auto";

    // Try multiple translation backends for reliability
    const backends = [
      `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`,
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
    ];

    for (const url of backends) {
      try {
        const resp = await fetch(url, {
          headers: { "Accept": "application/json" },
        });
        if (!resp.ok) continue;

        if (url.includes("lingva.ml")) {
          const data = await resp.json();
          const translatedText: string = data.translation ?? "";
          if (translatedText) {
            const detectedLang: string | undefined = data.info?.detectedSourceLang ?? data.info?.sourceLang;
            return new Response(JSON.stringify({
              translatedText,
              detectedLang: detectedLang ?? null,
              detectedLangName: detectedLang ? (LANG_NAMES[detectedLang] ?? detectedLang) : null,
              targetLangName: LANG_NAMES[targetLang] ?? targetLang,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          const data = await resp.json();
          const translatedText: string = (data[0] as any[]).map((s: any) => s[0]).join("");
          if (translatedText) {
            const detectedLang: string = data[2] ?? data[8]?.[0]?.[0] ?? "auto";
            return new Response(JSON.stringify({
              translatedText,
              detectedLang: detectedLang ?? null,
              detectedLangName: detectedLang ? (LANG_NAMES[detectedLang] ?? detectedLang) : null,
              targetLangName: LANG_NAMES[targetLang] ?? targetLang,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch {
        continue;
      }
    }

    return new Response(JSON.stringify({ error: "Translation service unavailable" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
