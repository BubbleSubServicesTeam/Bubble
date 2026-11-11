const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SLEEPER_BASE = "https://api.sleeper.app/v1"; // full sleeper proxy

// In-memory cache for the massive players list (~5-8MB, refreshes once daily on Sleeper's side)
let playersCache: { data: any; ts: number } | null = null;
const PLAYERS_CACHE_MS = 3600_000; // 1 hour

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "players";

    switch (action) {
      case "players": return await fetchPlayers(req);
      case "state": return await fetchNFLState();
      case "trending": return await fetchTrending(req);
      case "week_stats": return await fetchWeekStats(req);
      case "user": return await fetchUser(req);
      case "user_leagues": return await fetchUserLeagues(req);
      case "user_drafts": return await fetchUserDrafts(req);
      case "league": return await fetchLeague(req);
      case "league_rosters": return await fetchLeagueRosters(req);
      case "league_users": return await fetchLeagueUsers(req);
      case "league_matchups": return await fetchLeagueMatchups(req);
      case "league_transactions": return await fetchLeagueTransactions(req);
      case "league_traded_picks": return await fetchLeagueTradedPicks(req);
      case "league_drafts": return await fetchLeagueDrafts(req);
      case "league_winners_bracket": return await fetchLeagueBracket(req, "winners_bracket");
      case "league_losers_bracket": return await fetchLeagueBracket(req, "losers_bracket");
      case "draft": return await fetchDraft(req);
      case "draft_picks": return await fetchDraftPicks(req);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ───

async function sleeperFetch(path: string): Promise<Response> {
  try {
    const res = await fetch(`${SLEEPER_BASE}${path}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Sleeper API returned ${res.status}`, body: body.slice(0, 500) }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON from Sleeper", body: text.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: `Network error: ${(err as Error).message}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Player endpoints ───

async function fetchPlayers(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const season = url.searchParams.get("season") ?? "2026";
  const position = url.searchParams.get("position");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") ?? "500");

  // Use cache if fresh
  if (!playersCache || Date.now() - playersCache.ts > PLAYERS_CACHE_MS) {
    const res = await fetch(`${SLEEPER_BASE}/players/nfl`);
    if (!res.ok) {
      return json({ players: [], error: "Sleeper API unavailable" });
    }
    const data = await res.json();
    playersCache = { data, ts: Date.now() };
  }

  const allPlayers = playersCache.data;
  let players = Object.values(allPlayers)
    .filter((p: any) => {
      if (!p.position) return false;
      if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position)) return false;
      if (p.active === false && p.status !== "Active") return false;
      if (p.position !== "DEF" && !p.team) return false;
      if (position && p.position !== position) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (p.full_name ?? p.name ?? "").toLowerCase();
        const team = (p.team ?? "").toLowerCase();
        if (!name.includes(q) && !team.includes(q)) return false;
      }
      return true;
    })
    .map((p: any) => {
      const searchRank = p.search_rank ? parseInt(p.search_rank) : 999999;
      let projected: number;
      if (searchRank <= 500) {
        projected = Math.max(5, Math.round((450 - searchRank * 0.8) * 100) / 100);
      } else {
        projected = 5;
      }

      return {
        player_id: String(p.player_id),
        name: (p.full_name ?? p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()) || "Unknown",
        team: p.team ?? null,
        position: p.position,
        jersey: p.number ? parseInt(p.number) : null,
        height: p.height ?? null,
        weight: p.weight ? parseInt(p.weight) : null,
        age: p.age ?? null,
        years_exp: p.years_exp ?? null,
        college: p.college ?? null,
        status: p.status ?? null,
        injury_status: p.injury_status ?? null,
        injury_body_part: p.injury_body_part ?? null,
        injury_notes: p.injury_notes ?? null,
        news_updated: p.news_updated ?? null,
        depth_chart_order: p.depth_chart_order ?? null,
        depth_chart_position: p.depth_chart_position ?? null,
        search_rank: searchRank,
        projected_points: projected,
        live_points: 0,
        week: 1,
        season: parseInt(season),
      };
    })
    .sort((a: any, b: any) => (b.projected_points ?? 0) - (a.projected_points ?? 0));

  if (limit > 0) players = players.slice(0, limit);

  return json({ players, total: players.length });
}

async function fetchTrending(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "add";
  const lookback = url.searchParams.get("lookback") ?? "24";
  const limit = url.searchParams.get("limit") ?? "100";

  const res = await fetch(`${SLEEPER_BASE}/players/nfl/trending/${type}?lookback=${lookback}&limit=${limit}`);
  if (!res.ok) return json({ players: [] });

  const trendingIds = await res.json();

  // Use cached players for details
  if (!playersCache || Date.now() - playersCache.ts > PLAYERS_CACHE_MS) {
    const allRes = await fetch(`${SLEEPER_BASE}/players/nfl`);
    if (!allRes.ok) return json({ players: [] });
    const data = await allRes.json();
    playersCache = { data, ts: Date.now() };
  }

  const allPlayers = playersCache.data;
  const result = trendingIds
    .map((item: any) => {
      const pid = String(item.player_id ?? item);
      const p = allPlayers[pid];
      if (!p) return null;
      const searchRank = p.search_rank ? parseInt(p.search_rank) : 999999;
      const projected = searchRank <= 500
        ? Math.max(5, Math.round((450 - searchRank * 0.8) * 100) / 100)
        : 5;
      return {
        player_id: pid,
        name: (p.full_name ?? p.name ?? "Unknown"),
        team: p.team ?? null,
        position: p.position,
        projected_points: projected,
        live_points: 0,
        count: item.count ?? 0,
        injury_status: p.injury_status ?? null,
      };
    })
    .filter(Boolean);

  return json({ players: result, type, lookback });
}

// ─── State endpoint ───

async function fetchNFLState(): Promise<Response> {
  return sleeperFetch("/state/nfl");
}

// ─── Stats endpoint ───

async function fetchWeekStats(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const season = url.searchParams.get("season") ?? "2026";
  const week = url.searchParams.get("week") ?? "1";

  const res = await fetch(`${SLEEPER_BASE}/stats/nfl/regular/${season}/${week}`);
  if (!res.ok) return json({ stats: {}, week: parseInt(week) });

  const stats = await res.json();
  const points: Record<string, number> = {};
  for (const [pid, s] of Object.entries(stats)) {
    const st = s as any;
    if (st && typeof st === "object") {
      points[pid] = st.pts_ppr ?? st.pts_std ?? 0;
    }
  }

  return json({ stats: points, week: parseInt(week) });
}

// ─── User endpoints ───

async function fetchUser(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const username = url.searchParams.get("username");
  if (!username) return json({ error: "username required" }, 400);
  return sleeperFetch(`/user/${username}`);
}

async function fetchUserLeagues(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const season = url.searchParams.get("season") ?? "2026";
  if (!userId) return json({ error: "user_id required" }, 400);
  return sleeperFetch(`/user/${userId}/leagues/nfl/${season}`);
}

async function fetchUserDrafts(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const season = url.searchParams.get("season") ?? "2026";
  if (!userId) return json({ error: "user_id required" }, 400);
  return sleeperFetch(`/user/${userId}/drafts/nfl/${season}`);
}

// ─── League endpoints ───

async function fetchLeague(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}`);
}

async function fetchLeagueRosters(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/rosters`);
}

async function fetchLeagueUsers(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/users`);
}

async function fetchLeagueMatchups(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  const week = url.searchParams.get("week") ?? "1";
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/matchups/${week}`);
}

async function fetchLeagueTransactions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  const week = url.searchParams.get("week") ?? "1";
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/transactions/${week}`);
}

async function fetchLeagueTradedPicks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/traded_picks`);
}

async function fetchLeagueDrafts(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/drafts`);
}

async function fetchLeagueBracket(req: Request, bracket: string): Promise<Response> {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("league_id");
  if (!leagueId) return json({ error: "league_id required" }, 400);
  return sleeperFetch(`/league/${leagueId}/${bracket}`);
}

// ─── Draft endpoints ───

async function fetchDraft(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const draftId = url.searchParams.get("draft_id");
  if (!draftId) return json({ error: "draft_id required" }, 400);
  return sleeperFetch(`/draft/${draftId}`);
}

async function fetchDraftPicks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const draftId = url.searchParams.get("draft_id");
  if (!draftId) return json({ error: "draft_id required" }, 400);
  return sleeperFetch(`/draft/${draftId}/picks`);
}
