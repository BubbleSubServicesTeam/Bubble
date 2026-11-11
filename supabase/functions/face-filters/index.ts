const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FILTER_API = "https://bubblefaceanimations-341.lovable.app/api/public/v1";
const API_KEY = Deno.env.get("BUBBLE_FACE_API_KEY") ?? "ff_live_8de6b9e9a71ebf13b88e5b6492448fcd31da6603b3b281b4";
const CATEGORIES = ["sticker", "mask", "makeup", "warp", "tint", "combo"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function upstream(path: string, apiKey: string): Promise<Response> {
  return fetch(`${FILTER_API}${path}`, { headers: { "x-api-key": apiKey } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = API_KEY;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error: "Invalid filter id" }, 400);
      const res = await upstream(`/filters/${id}`, apiKey);
      if (!res.ok) return json({ error: "Filter not found" }, res.status === 404 ? 404 : 502);
      return json(await res.json());
    }

    const params = new URLSearchParams();
    const category = url.searchParams.get("category");
    if (category) {
      if (!CATEGORIES.includes(category)) return json({ error: "Invalid category" }, 400);
      params.set("category", category);
    }
    const q = url.searchParams.get("q");
    if (q) params.set("q", q.slice(0, 80));

    const res = await upstream(`/filters${params.toString() ? `?${params}` : ""}`, apiKey);
    if (!res.ok) return json({ error: "Could not load filters" }, 502);
    const data = await res.json();
    if (!Array.isArray(data?.filters)) return json({ error: "Unexpected filter response" }, 502);
    return json({ filters: data.filters });
  } catch (err) {
    return json({ error: (err as Error).message ?? "Internal error" }, 500);
  }
});
