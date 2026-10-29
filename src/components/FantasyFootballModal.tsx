import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, Profile, Conversation, smartName } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  X, Trophy, Users, Clock, Settings, ChevronRight, Check, Search,
  ChevronLeft, UserCircle, TrendingUp, TrendingDown, ArrowRightLeft,
  Activity, RefreshCw, Download, AlertCircle, Zap, ExternalLink, Trash2,
} from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import Avatar from './Avatar';

type FFLeague = {
  id: string; name: string; owner_id: string; conversation_id: string | null;
  sleeper_league_id: string | null; sleeper_username: string | null;
  draft_time: string | null; draft_status: string; current_pick_index: number;
  season: number; num_teams: number; [key: string]: any;
};
type FFMember = {
  id: string; league_id: string; user_id: string; team_name: string;
  draft_position: number; wins: number; losses: number; ties: number;
  points_for: number; points_against: number;
};
type FFPlayer = {
  id?: string; player_id: string; name: string; team: string | null;
  position: string | null; jersey: number | null; height: string | null;
  weight: number | null; age: number | null; years_exp: number | null;
  college: string | null; status: string | null; injury_status: string | null;
  injury_body_part: string | null; injury_notes: string | null;
  search_rank: number | null; depth_chart_order: number | null;
  depth_chart_position: string | null; live_points: number;
  projected_points: number; week?: number; season?: number; count?: number;
};
type FFChatMsg = {
  id: string; league_id: string; sender_id: string; content: string | null;
  message_type: string; player_id: string | null; created_at: string;
};
type FFTrade = {
  id: string; league_id: string; proposer_member_id: string;
  target_member_id: string; offered_player_ids: string[];
  requested_player_ids: string[]; status: string; proposed_at: string;
  resolved_at: string | null;
};
type SleeperLeague = {
  league_id: string; name: string; season: string; status: string;
  total_rosters: number; scoring_settings: Record<string, any>; roster_positions: string[];
};
type SleeperRoster = {
  roster_id: number; owner_id: string; players: string[];
  starters: string[]; reserve: string[]; taxi: string[];
  settings: { wins: number; losses: number; ties: number; fpts: number; fpts_decimal: number; fpts_against: number };
};
type SleeperUser = {
  user_id: string; username: string; display_name: string; avatar: string | null; is_owner: boolean;
};
type SleeperMatchup = {
  roster_id: number; matchup_id: number; points: number;
  players: string[]; starters: string[]; starters_points: number[];
};
type NFLState = { week: number; season: string; season_type: string };
type Props = { onClose: () => void; onCreated: (conv: Conversation) => void };

async function sleeperAPI(action: string, params: Record<string, string> = {}): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nfl-stats?action=${action}`;
  const qs = Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const res = await fetch(`${apiUrl}${qs}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const INJURY_COLORS: Record<string, string> = {
  Active: 'text-emerald-500', Inactive: 'text-red-500', IR: 'text-red-500',
  Out: 'text-red-500', Doubtful: 'text-orange-500', Questionable: 'text-amber-500',
  PUP: 'text-orange-500', SUS: 'text-red-500',
};
function injuryColor(status: string | null): string {
  if (!status) return '';
  return INJURY_COLORS[status] ?? 'text-slate-400';
}

export default function FantasyFootballModal({ onClose, onCreated }: Props) {
  const { user, profile } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'league' | 'import' | 'player'>('list');
  const [leagues, setLeagues] = useState<FFLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState<FFLeague | null>(null);
  const [error, setError] = useState('');
  const [nflState, setNflState] = useState<NFLState | null>(null);
  const [leagueName, setLeagueName] = useState('');
  const [numTeams, setNumTeams] = useState(10);
  const [draftTime, setDraftTime] = useState('');
  const [creating, setCreating] = useState(false);
  const [sleeperUsername, setSleeperUsername] = useState('');
  const [sleeperError, setSleeperError] = useState('');
  const [sleeperUser, setSleeperUser] = useState<any>(null);
  const [sleeperLeagues, setSleeperLeagues] = useState<SleeperLeague[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<'search' | 'select'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [invited, setInvited] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [members, setMembers] = useState<FFMember[]>([]);
  const [chatMsgs, setChatMsgs] = useState<FFChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [players, setPlayers] = useState<FFPlayer[]>([]);
  const [playerMap, setPlayerMap] = useState<Record<string, FFPlayer>>({});
  const [draftPicks, setDraftPicks] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [trades, setTrades] = useState<FFTrade[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'roster' | 'standings' | 'draft' | 'matchup' | 'waiver' | 'trades' | 'players' | 'settings'>('matchup');
  const [myMember, setMyMember] = useState<FFMember | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sleeperRosters, setSleeperRosters] = useState<SleeperRoster[]>([]);
  const [sleeperUsers, setSleeperUsers] = useState<SleeperUser[]>([]);
  const [sleeperMatchups, setSleeperMatchups] = useState<SleeperMatchup[]>([]);
  const [sleeperLeagueInfo, setSleeperLeagueInfo] = useState<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<FFPlayer | null>(null);
  const [trending, setTrending] = useState<FFPlayer[]>([]);
  const [trendingType, setTrendingType] = useState<'add' | 'drop'>('add');
  const [waiverSearch, setWaiverSearch] = useState('');
  const [tradeTarget, setTradeTarget] = useState<FFMember | null>(null);
  const [offeredPlayerIds, setOfferedPlayerIds] = useState<string[]>([]);
  const [requestedPlayerIds, setRequestedPlayerIds] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const playersLoaded = useRef(false);
  const [deleteLeagueConfirm, setDeleteLeagueConfirm] = useState<FFLeague | null>(null);
  const [resetSleeperConfirm, setResetSleeperConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => { sleeperAPI('state').then(setNflState).catch(() => {}); }, []);

  const loadLeagues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ownedRes, memberRes] = await Promise.all([
        supabase.from('ff_leagues').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('ff_league_members').select('league_id').eq('user_id', user.id),
      ]);
      const owned = (ownedRes.data as FFLeague[]) ?? [];
      const memberLeagueIds = ((memberRes.data as any[]) ?? []).map(m => m.league_id);
      let memberLeagues: FFLeague[] = [];
      if (memberLeagueIds.length > 0) {
        const { data: ml } = await supabase.from('ff_leagues').select('*').in('id', memberLeagueIds).neq('owner_id', user.id);
        memberLeagues = (ml as FFLeague[]) ?? [];
      }
      setLeagues([...owned, ...memberLeagues]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  async function deleteLeague(league: FFLeague) {
    if (!user) return;
    setDeleting(league.id);
    try {
      await Promise.all([
        supabase.from('ff_chat_messages').delete().eq('league_id', league.id),
        supabase.from('ff_draft_picks').delete().eq('league_id', league.id),
        supabase.from('ff_rosters').delete().eq('league_id', league.id),
        supabase.from('ff_trades').delete().eq('league_id', league.id),
        supabase.from('ff_league_members').delete().eq('league_id', league.id),
      ]);
      await supabase.from('ff_leagues').delete().eq('id', league.id);
      setDeleteLeagueConfirm(null);
      loadLeagues();
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  }

  async function resetAllSleeper() {
    if (!user) return;
    setResetting(true);
    try {
      const { data: sleeperLeagues } = await supabase
        .from('ff_leagues')
        .select('id')
        .eq('owner_id', user.id)
        .not('sleeper_league_id', 'is', null);
      if (sleeperLeagues && sleeperLeagues.length > 0) {
        const ids = sleeperLeagues.map(l => l.id);
        await Promise.all([
          supabase.from('ff_chat_messages').delete().in('league_id', ids),
          supabase.from('ff_draft_picks').delete().in('league_id', ids),
          supabase.from('ff_rosters').delete().in('league_id', ids),
          supabase.from('ff_trades').delete().in('league_id', ids),
          supabase.from('ff_league_members').delete().in('league_id', ids),
        ]);
        await supabase.from('ff_leagues').delete().in('id', ids);
      }
      setResetSleeperConfirm(false);
      loadLeagues();
    } catch { /* ignore */ }
    finally { setResetting(false); }
  }

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const q = searchQuery.toLowerCase();
      const { data } = await supabase.from('profiles')
        .select('id, user_id, display_name, first_name, last_name, avatar_url, status, last_seen')
        .neq('user_id', user?.id ?? '')
        .or(`first_name.ilike.*${q}*,last_name.ilike.*${q}*,display_name.ilike.*${q}*`).limit(15);
      setSearchResults((data as Profile[]) ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, user]);

  const loadPlayers = useCallback(async () => {
    if (playersLoaded.current) return;
    playersLoaded.current = true;
    try {
      const { data: dbPlayers } = await supabase.from('ff_players').select('*').order('projected_points', { ascending: false }).limit(500);
      if (dbPlayers && dbPlayers.length > 0) {
        const mapped = dbPlayers as FFPlayer[];
        setPlayers(mapped);
        const map: Record<string, FFPlayer> = {};
        mapped.forEach(p => { map[p.player_id] = p; });
        setPlayerMap(map);
        return;
      }
      const data = await sleeperAPI('players', { season: String(nflState?.season ?? '2026'), limit: '500' });
      if (data.players && Array.isArray(data.players)) {
        setPlayers(data.players);
        const map: Record<string, FFPlayer> = {};
        data.players.forEach((p: FFPlayer) => { map[p.player_id] = p; });
        setPlayerMap(map);
        supabase.from('ff_players').upsert(data.players, { onConflict: 'player_id' }).then(() => {});
      }
    } catch { playersLoaded.current = false; }
  }, [nflState]);

  async function createLeague() {
    if (!user || !leagueName.trim()) { setError('League name is required'); return; }
    if (draftTime && new Date(draftTime) <= new Date()) { setError('Draft time must be in the future'); return; }
    setCreating(true); setError('');
    try {
      const { data: league, error: le } = await supabase.from('ff_leagues').insert({
        name: leagueName.trim(), owner_id: user.id,
        draft_time: draftTime ? new Date(draftTime).toISOString() : null, num_teams: numTeams,
      }).select('*').single();
      if (le || !league) throw new Error(le?.message ?? 'Failed to create league');
      await supabase.from('ff_league_members').insert({
        league_id: league.id, user_id: user.id,
        team_name: `${profile?.first_name ?? 'My'} Team`, draft_position: 1,
      });
      for (let i = 0; i < invited.length; i++) {
        await supabase.from('ff_league_members').insert({
          league_id: league.id, user_id: invited[i].user_id,
          team_name: `${invited[i].first_name ?? invited[i].display_name} Team`, draft_position: i + 2,
        });
      }
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('create_conversation', {
        p_other_user_ids: invited.map(p => p.user_id), p_is_group: true, p_name: `${leagueName.trim()} - Fantasy League`,
      });
      let convId: string | null = null;
      if (!rpcErr && rpcResult) {
        let rpcData: any = rpcResult;
        if (typeof rpcData === 'string') { try { rpcData = JSON.parse(rpcData); } catch { /* ignore */ } }
        convId = rpcData?.id ?? null;
      }
      if (convId) await supabase.from('ff_leagues').update({ conversation_id: convId }).eq('id', league.id);
      setLeagueName(''); setDraftTime(''); setInvited([]);
      setSelectedLeague(league as FFLeague);
      setView('league'); loadLeagues();
    } catch (err: any) { setError(err?.message ?? 'Failed to create league'); }
    finally { setCreating(false); }
  }

  async function searchSleeperUser() {
    if (!sleeperUsername.trim()) return;
    setImporting(true); setError('');
    try {
      const userData = await sleeperAPI('user', { username: sleeperUsername.trim() });
      if (userData.error || !userData.user_id) {
        setError('Sleeper user not found');
        setSleeperUser(null); setSleeperLeagues([]);
        return;
      }
      setSleeperUser(userData);
      const season = nflState?.season ?? '2026';
      const leaguesData = await sleeperAPI('user_leagues', { user_id: userData.user_id, season });
      const leaguesList = Array.isArray(leaguesData) ? leaguesData : [];
      setSleeperLeagues(leaguesList.map((l: any) => ({
        league_id: l.league_id, name: l.name, season: l.season, status: l.status,
        total_rosters: l.total_rosters ?? l.settings?.max_teams ?? 12,
        scoring_settings: l.scoring_settings ?? {}, roster_positions: l.roster_positions ?? [],
      })));
      setImportStep('select');
    } catch (err: any) { setError(err?.message ?? 'Failed to search Sleeper'); }
    finally { setImporting(false); }
  }

  async function importSleeperLeague(sleeperLeague: SleeperLeague) {
    if (!user) return;
    setImporting(true); setError('');
    try {
      const { data: league, error: le } = await supabase.from('ff_leagues').insert({
        name: sleeperLeague.name, owner_id: user.id,
        sleeper_league_id: sleeperLeague.league_id, sleeper_username: sleeperUsername.trim(),
        num_teams: sleeperLeague.total_rosters, draft_status: 'completed', season: parseInt(sleeperLeague.season),
      }).select('*').single();
      if (le || !league) throw new Error(le?.message ?? 'Failed to import league');
      await supabase.from('ff_league_members').insert({
        league_id: league.id, user_id: user.id,
        team_name: `${profile?.first_name ?? 'My'} Team`, draft_position: 1,
      });
      const { data: convData, error: convErr } = await supabase.rpc('create_conversation', {
        p_other_user_ids: [], p_is_group: true, p_name: sleeperLeague.name,
      });
      let convId: string | null = null;
      if (!convErr && convData) {
        let rpcData = convData as any;
        if (typeof rpcData === 'string') { try { rpcData = JSON.parse(rpcData); } catch { /* ignore */ } }
        convId = rpcData?.id ?? null;
        if (convId) {
          await supabase.from('ff_leagues').update({ conversation_id: convId }).eq('id', league.id);
          league.conversation_id = convId;
        }
      }
      setSleeperUsername(''); setSleeperUser(null); setSleeperLeagues([]);
      setImportStep('search');
      setSelectedLeague(league as FFLeague);
      setView('league'); loadLeagues();
      if (convId) {
        const { data: fullConv } = await supabase
          .from('conversations')
          .select('*, members:profiles!conversation_members(*)')
          .eq('id', convId)
          .single();
        if (fullConv) onCreated(fullConv as any);
      }
    } catch (err: any) { setError(err?.message ?? 'Failed to import league'); }
    finally { setImporting(false); }
  }

  async function loadLeagueDetail(league: FFLeague) {
    setSelectedLeague(league); setView('league');
    setDetailLoading(true); setError('');
    try {
      const [memRes, chatRes, picksRes, rosterRes, tradeRes] = await Promise.all([
        supabase.from('ff_league_members').select('*').eq('league_id', league.id),
        supabase.from('ff_chat_messages').select('*').eq('league_id', league.id).order('created_at', { ascending: true }).limit(200),
        supabase.from('ff_draft_picks').select('*, player:ff_players(*)').eq('league_id', league.id).order('pick_number', { ascending: true }),
        supabase.from('ff_rosters').select('*, player:ff_players(*), member:ff_league_members(*)').eq('league_id', league.id),
        supabase.from('ff_trades').select('*').eq('league_id', league.id).order('proposed_at', { ascending: false }),
      ]);
      setMembers((memRes.data as FFMember[]) ?? []);
      setChatMsgs((chatRes.data as FFChatMsg[]) ?? []);
      setDraftPicks((picksRes.data as any[]) ?? []);
      setRosters((rosterRes.data as any[]) ?? []);
      setTrades((tradeRes.data as FFTrade[]) ?? []);
      if (user) {
        const me = ((memRes.data as FFMember[]) ?? []).find(m => m.user_id === user.id);
        setMyMember(me ?? null);
      }
      loadPlayers();
      if (league.sleeper_league_id) loadSleeperData(league.sleeper_league_id);
      subscribeToChat(league.id);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  async function loadSleeperData(sleeperLeagueId: string) {
    setSleeperError('');
    try {
      const week = String(nflState?.week ?? 1);
      const [leagueInfo, rostersData, usersData, matchupsData] = await Promise.all([
        sleeperAPI('league', { league_id: sleeperLeagueId }),
        sleeperAPI('league_rosters', { league_id: sleeperLeagueId }),
        sleeperAPI('league_users', { league_id: sleeperLeagueId }),
        sleeperAPI('league_matchups', { league_id: sleeperLeagueId, week }),
      ]);
      setSleeperLeagueInfo(leagueInfo);
      setSleeperRosters(rostersData ?? []);
      setSleeperUsers(usersData ?? []);
      setSleeperMatchups(matchupsData ?? []);
      loadPlayers();
    } catch (err: any) {
      setSleeperError(err?.message ?? 'Failed to load league data from Sleeper');
    }
  }

  async function refreshSleeperData() {
    if (!selectedLeague?.sleeper_league_id) return;
    setDetailLoading(true);
    await loadSleeperData(selectedLeague.sleeper_league_id);
    setDetailLoading(false);
  }

  function subscribeToChat(leagueId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase.channel(`ff_chat_${leagueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_chat_messages', filter: `league_id=eq.${leagueId}` },
        (payload: any) => { setChatMsgs(prev => [...prev, payload.new as FFChatMsg]); })
      .subscribe();
    channelRef.current = channel;
  }
  useEffect(() => { return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); }; }, []);

  async function sendChat() {
    if (!chatInput.trim() || !selectedLeague || !user || sending) return;
    setSending(true);
    const content = chatInput.trim();
    setChatInput('');
    await supabase.from('ff_chat_messages').insert({ league_id: selectedLeague.id, sender_id: user.id, content, message_type: 'text' });
    setSending(false);
  }

  async function draftPlayer(player: FFPlayer) {
    if (!selectedLeague || !myMember || !user) return;
    if (selectedLeague.draft_status !== 'drafting') { setError('Draft has not started'); return; }
    const teamsCount = selectedLeague.num_teams ?? 10;
    const totalPicks = draftPicks.length;
    const round = Math.floor(totalPicks / teamsCount) + 1;
    const pickNum = totalPicks + 1;
    const expectedPos = snakeDraftPosition(totalPicks, teamsCount);
    if (myMember.draft_position !== expectedPos) { setError('Not your turn to pick'); return; }
    let playerId = player.id;
    if (!playerId) {
      const { data: upserted } = await supabase.from('ff_players').upsert({
        player_id: player.player_id, name: player.name, team: player.team,
        position: player.position, projected_points: player.projected_points, season: selectedLeague.season,
      }, { onConflict: 'player_id' }).select().single();
      playerId = upserted?.id;
    }
    if (!playerId) { setError('Failed to save player'); return; }
    const { error: pe } = await supabase.from('ff_draft_picks').insert({
      league_id: selectedLeague.id, member_id: myMember.id, player_id: playerId, round, pick_number: pickNum,
    });
    if (pe) { setError(pe.message); return; }
    await supabase.from('ff_rosters').insert({ league_id: selectedLeague.id, member_id: myMember.id, player_id: playerId, is_starter: false });
    await supabase.from('ff_chat_messages').insert({
      league_id: selectedLeague.id, sender_id: user.id,
      content: `${myMember.team_name} drafted ${player.name} (${player.position ?? 'N/A'}, ${player.team ?? 'N/A'})`,
      message_type: 'draft_pick', player_id: playerId,
    });
    setPlayerSearch('');
    loadLeagueDetail(selectedLeague);
  }

  function snakeDraftPosition(pickIndex: number, numTeams: number): number {
    const round = Math.floor(pickIndex / numTeams);
    const posInRound = pickIndex % numTeams;
    if (round % 2 === 0) return posInRound + 1;
    return numTeams - posInRound;
  }

  async function startDraft() {
    if (!selectedLeague || !user) return;
    if (selectedLeague.owner_id !== user.id) return;
    setSelectedLeague({ ...selectedLeague, draft_status: 'drafting' });
    setActiveTab('draft');
    if (players.length === 0) loadPlayers();
    supabase.from('ff_leagues').update({ draft_status: 'drafting', current_pick_index: 0 }).eq('id', selectedLeague.id);
    supabase.from('ff_chat_messages').insert({ league_id: selectedLeague.id, sender_id: user.id, content: 'The draft has started!', message_type: 'system' });
  }

  async function updateLeagueSettings(updates: Record<string, any>) {
    if (!selectedLeague || !user || selectedLeague.owner_id !== user.id) return;
    const { error: ue } = await supabase.from('ff_leagues').update(updates).eq('id', selectedLeague.id);
    if (ue) { setError(ue.message); return; }
    setSelectedLeague({ ...selectedLeague, ...updates });
  }

  async function proposeTrade() {
    if (!selectedLeague || !myMember || !tradeTarget) return;
    if (offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0) { setError('Select players from both sides'); return; }
    const { error: te } = await supabase.from('ff_trades').insert({
      league_id: selectedLeague.id, proposer_member_id: myMember.id, target_member_id: tradeTarget.id,
      offered_player_ids: offeredPlayerIds, requested_player_ids: requestedPlayerIds, status: 'pending',
    });
    if (te) { setError(te.message); return; }
    await supabase.from('ff_chat_messages').insert({
      league_id: selectedLeague.id, sender_id: user!.id,
      content: `${myMember.team_name} proposed a trade with ${tradeTarget.team_name}`, message_type: 'system',
    });
    setTradeTarget(null); setOfferedPlayerIds([]); setRequestedPlayerIds([]);
    loadLeagueDetail(selectedLeague);
  }

  async function respondToTrade(trade: FFTrade, accept: boolean) {
    if (!selectedLeague || !user) return;
    const status = accept ? 'accepted' : 'rejected';
    await supabase.from('ff_trades').update({ status, resolved_at: new Date().toISOString() }).eq('id', trade.id);
    if (accept) {
      const offeredRosters = rosters.filter(r => r.member_id === trade.proposer_member_id && trade.offered_player_ids.includes(r.player?.player_id));
      const requestedRosters = rosters.filter(r => r.member_id === trade.target_member_id && trade.requested_player_ids.includes(r.player?.player_id));
      for (const r of offeredRosters) await supabase.from('ff_rosters').update({ member_id: trade.target_member_id }).eq('id', r.id);
      for (const r of requestedRosters) await supabase.from('ff_rosters').update({ member_id: trade.proposer_member_id }).eq('id', r.id);
      await supabase.from('ff_chat_messages').insert({
        league_id: selectedLeague.id, sender_id: user.id,
        content: 'A trade was accepted and rosters have been updated', message_type: 'system',
      });
    }
    loadLeagueDetail(selectedLeague);
  }

  async function loadTrending(type: 'add' | 'drop') {
    setTrendingType(type);
    try {
      const data = await sleeperAPI('trending', { type, lookback: '24', limit: '50' });
      setTrending(data.players ?? []);
    } catch { /* ignore */ }
  }

  const isOwner = selectedLeague?.owner_id === user?.id;
  const isSleeperLeague = !!selectedLeague?.sleeper_league_id;
  const draftedPlayerIds = new Set(draftPicks.map(dp => dp.player?.player_id ?? dp.player_id));
  const myRoster = rosters.filter(r => r.member_id === myMember?.id);
  const currentPickPos = snakeDraftPosition(draftPicks.length, selectedLeague?.num_teams ?? 10);
  const isMyTurn = selectedLeague?.draft_status === 'drafting' && myMember?.draft_position === currentPickPos;
  const mySleeperRoster = sleeperRosters.find(r => {
    const su = sleeperUsers.find(u => u.user_id === r.owner_id);
    return su?.username === selectedLeague?.sleeper_username || r.owner_id === sleeperUser?.user_id;
  });
  const myMatchup = sleeperMatchups.find(m => m.roster_id === mySleeperRoster?.roster_id);
  const opponentMatchup = sleeperMatchups.find(m => m.matchup_id === myMatchup?.matchup_id && m.roster_id !== mySleeperRoster?.roster_id);
  const matchupPairs: { home: SleeperMatchup; away: SleeperMatchup; homeUser?: SleeperUser; awayUser?: SleeperUser }[] = [];
  const matchupMap: Record<number, SleeperMatchup[]> = {};
  sleeperMatchups.forEach(m => { (matchupMap[m.matchup_id] ??= []).push(m); });
  Object.entries(matchupMap).forEach(([_, pair]) => {
    if (pair.length === 2) {
      const homeUser = sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === pair[0].roster_id)?.owner_id === u.user_id);
      const awayUser = sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === pair[1].roster_id)?.owner_id === u.user_id);
      matchupPairs.push({ home: pair[0], away: pair[1], homeUser, awayUser });
    }
  });
  const rosteredPlayerIds = new Set<string>();
  if (isSleeperLeague) sleeperRosters.forEach(r => r.players?.forEach(pid => rosteredPlayerIds.add(pid)));
  else rosters.forEach(r => { if (r.player?.player_id) rosteredPlayerIds.add(r.player.player_id); });
  const waiverPlayers = players.filter(p => !rosteredPlayerIds.has(p.player_id))
    .filter(p => !waiverSearch.trim() || p.name.toLowerCase().includes(waiverSearch.toLowerCase()) || (p.team ?? '').toLowerCase().includes(waiverSearch.toLowerCase()))
    .sort((a, b) => (b.projected_points ?? 0) - (a.projected_points ?? 0)).slice(0, 50);
  const allPlayersFiltered = players
    .filter(p => !playerSearch.trim() || p.name.toLowerCase().includes(playerSearch.toLowerCase()) || (p.team ?? '').toLowerCase().includes(playerSearch.toLowerCase()))
    .sort((a, b) => (b.projected_points ?? 0) - (a.projected_points ?? 0)).slice(0, 100);

  // ─── LIST VIEW ───
  if (view === 'list') return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Trophy size={16} className="text-sky-500" /> Fantasy Leagues</h3>
        <div className="flex gap-2">
          <button onClick={() => { setView('import'); setImportStep('search'); setSleeperUsername(''); setSleeperLeagues([]); }} className="flex items-center gap-1 text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"><Download size={14} /> Import</button>
          <button onClick={() => setView('create')} className="flex items-center gap-1 text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"><Trophy size={14} /> New League</button>
        </div>
      </div>
      {nflState && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-1.5"><Activity size={12} className="text-emerald-500" /> NFL {nflState.season_type === 'regular' ? 'Regular' : nflState.season_type} · Week {nflState.week}</div>}
      {loading ? <div className="flex justify-center py-8"><BubbleLoader size={32} /></div> : leagues.length === 0 ? (
        <div className="text-center py-8"><Trophy size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">No fantasy leagues yet</p>
          <div className="flex gap-2 justify-center mt-3">
            <button onClick={() => { setView('import'); setImportStep('search'); }} className="text-xs font-medium text-sky-500 hover:text-sky-400 px-3 py-1.5 rounded-lg bg-sky-500/10">Import from Sleeper</button>
            <button onClick={() => setView('create')} className="text-xs font-medium text-sky-500 hover:text-sky-400 px-3 py-1.5 rounded-lg bg-sky-500/10">Create New League</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
          {leagues.map(l => (
            <div key={l.id} className="flex items-center gap-1 group">
              <button onClick={() => loadLeagueDetail(l)} className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-left">
                <div className="w-9 h-9 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">{l.sleeper_league_id ? <Download size={16} className="text-sky-500" /> : <Trophy size={16} className="text-sky-500" />}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{l.name}</p><p className="text-xs text-slate-500">{l.sleeper_league_id && <span className="text-sky-500">Sleeper · </span>}{l.num_teams} teams · {l.draft_status === 'not_started' ? 'Draft pending' : l.draft_status === 'drafting' ? 'Drafting live' : 'Season active'}</p></div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button
                onClick={() => setDeleteLeagueConfirm(l)}
                disabled={deleting === l.id}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="Delete league"
              >
                {deleting === l.id ? <BubbleLoader size={16} /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
          {leagues.some(l => l.sleeper_league_id) && (
            <button
              onClick={() => setResetSleeperConfirm(true)}
              disabled={resetting}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-400 py-2 transition-colors">
              <RefreshCw size={12} className={resetting ? 'animate-spin' : ''} /> Reset all Sleeper leagues
            </button>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteLeagueConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeleteLeagueConfirm(null)}>
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center"><AlertCircle size={20} className="text-red-500" /></div>
              <div><p className="text-slate-900 dark:text-white font-bold text-sm">Delete league?</p><p className="text-slate-500 text-xs">"{deleteLeagueConfirm.name}" and all its data will be permanently removed.</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteLeagueConfirm(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-all">Cancel</button>
              <button onClick={() => deleteLeague(deleteLeagueConfirm)} className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-medium transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Sleeper confirm */}
      {resetSleeperConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={() => setResetSleeperConfirm(false)}>
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center"><RefreshCw size={20} className="text-red-500" /></div>
              <div><p className="text-slate-900 dark:text-white font-bold text-sm">Reset all Sleeper leagues?</p><p className="text-slate-500 text-xs">All imported Sleeper leagues will be deleted and their accounts unlinked. You can re-import them later.</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetSleeperConfirm(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-all">Cancel</button>
              <button onClick={resetAllSleeper} disabled={resetting} className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">{resetting ? <BubbleLoader size={18} /> : 'Reset All'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── CREATE VIEW ───
  if (view === 'create') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={18} /></button><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Trophy size={16} className="text-sky-500" /> Create Fantasy League</h3></div>
      <div className="space-y-1.5"><label className="text-xs font-medium text-slate-400">League Name</label><input type="text" value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="My Fantasy League" className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
      <div className="space-y-1.5"><label className="text-xs font-medium text-slate-400">Number of Teams</label><select value={numTeams} onChange={e => setNumTeams(parseInt(e.target.value))} className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30">{[4, 6, 8, 10, 12, 14, 16].map(n => <option key={n} value={n}>{n} teams</option>)}</select></div>
      <div className="space-y-1.5"><label className="text-xs font-medium text-slate-400">Draft Date & Time</label><input type="datetime-local" value={draftTime} onChange={e => setDraftTime(e.target.value)} className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
      <div className="space-y-1.5"><label className="text-xs font-medium text-slate-400">Invite League Members</label>
        {invited.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{invited.map(p => (<div key={p.id} className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 rounded-full pl-1.5 pr-1 py-1"><Avatar profile={p} size="xs" /><span className="text-sky-600 dark:text-sky-300 text-xs font-medium">{smartName(p)}</span><button onClick={() => setInvited(prev => prev.filter(s => s.id !== p.id))} className="w-4 h-4 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-500"><X size={10} /></button></div>))}</div>}
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name..." className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
        {searching && <div className="flex justify-center py-2"><BubbleLoader size={24} /></div>}
        {!searching && searchResults.length > 0 && <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">{searchResults.map(p => { const isInvited = invited.some(s => s.id === p.id); return (<button key={p.id} onClick={() => setInvited(prev => isInvited ? prev.filter(s => s.id !== p.id) : [...prev, p])} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${isInvited ? 'bg-sky-500/10' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}><Avatar profile={p} size="sm" /><span className="flex-1 text-left text-sm text-slate-900 dark:text-white">{smartName(p)}</span>{isInvited && <Check size={14} className="text-sky-500" />}</button>); })}</div>}
      </div>
      {error && <p className="text-red-500 text-xs text-center">{error}</p>}
      <button onClick={createLeague} disabled={creating || !leagueName.trim()} className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2">{creating ? <BubbleLoader size={24} /> : <><Trophy size={16} /> Create League</>}</button>
    </div>
  );

  // ─── IMPORT VIEW ───
  if (view === 'import') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={18} /></button><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Download size={16} className="text-sky-500" /> Import Sleeper League</h3></div>
      {importStep === 'search' && (<>
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3"><p className="text-xs text-sky-600 dark:text-sky-300">Enter your Sleeper username to import your real fantasy league. We pull live scores, rosters, matchups, standings, and player data directly from Sleeper.</p></div>
        <div className="space-y-1.5"><label className="text-xs font-medium text-slate-400">Sleeper Username</label><input type="text" value={sleeperUsername} onChange={e => setSleeperUsername(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchSleeperUser(); }} placeholder="e.g. FantasyKing123" className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
        <button onClick={searchSleeperUser} disabled={importing || !sleeperUsername.trim()} className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2">{importing ? <BubbleLoader size={24} /> : <><Search size={16} /> Search Leagues</>}</button>
      </>)}
      {importStep === 'select' && (<>
        {sleeperUser && <div className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 rounded-xl p-3"><div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center"><UserCircle size={20} className="text-sky-500" /></div><div><p className="text-sm font-semibold text-slate-900 dark:text-white">{sleeperUser.display_name ?? sleeperUser.username}</p><p className="text-xs text-slate-500">@{sleeperUser.username} · {sleeperLeagues.length} leagues found</p></div></div>}
        <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
          {sleeperLeagues.length === 0 && <p className="text-center text-slate-500 text-sm py-4">No active leagues found for this season</p>}
          {sleeperLeagues.map(l => (<button key={l.league_id} onClick={() => importSleeperLeague(l)} disabled={importing} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-left"><div className="w-9 h-9 rounded-lg bg-sky-500/20 flex items-center justify-center"><Trophy size={16} className="text-sky-500" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{l.name}</p><p className="text-xs text-slate-500">{l.total_rosters} teams · {l.status === 'in_season' ? 'In Season' : l.status === 'pre_draft' ? 'Pre-Draft' : l.status}</p></div>{importing ? <BubbleLoader size={20} /> : <Download size={16} className="text-sky-500" />}</button>))}
        </div>
        <button onClick={() => { setImportStep('search'); setSleeperLeagues([]); }} className="text-xs text-slate-500 hover:text-slate-400 w-full text-center">Search different username</button>
        {error && !sleeperUser && <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 text-center"><p className="text-xs text-slate-500 mb-2">No accounts found by that name.</p><a href="https://sleeper.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-sky-500 hover:text-sky-400">sleeper.com <ExternalLink size={11} /></a></div>}
      </>)}
    </div>
  );

  // ─── PLAYER DETAIL VIEW ───
  if (view === 'player' && selectedPlayer) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><button onClick={() => setView('league')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={18} /></button><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Activity size={16} className="text-sky-500" /> {selectedPlayer.name}</h3></div>
      <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-sky-500/20 flex items-center justify-center"><span className="text-lg font-bold text-sky-500">{selectedPlayer.position ?? '?'}</span></div>
          <div className="flex-1">
            <p className="text-base font-bold text-slate-900 dark:text-white">{selectedPlayer.name}</p>
            <p className="text-sm text-slate-500">{selectedPlayer.team ?? 'FA'} · {selectedPlayer.position}</p>
            {selectedPlayer.injury_status && <p className={`text-xs font-medium mt-0.5 ${injuryColor(selectedPlayer.injury_status)}`}><AlertCircle size={10} className="inline mr-1" />{selectedPlayer.injury_status}{selectedPlayer.injury_body_part ? ` — ${selectedPlayer.injury_body_part}` : ''}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {selectedPlayer.jersey && <InfoBox label="Number" value={`#${selectedPlayer.jersey}`} />}
          {selectedPlayer.age && <InfoBox label="Age" value={String(selectedPlayer.age)} />}
          {selectedPlayer.height && <InfoBox label="Height" value={selectedPlayer.height} />}
          {selectedPlayer.weight && <InfoBox label="Weight" value={`${selectedPlayer.weight} lbs`} />}
          {selectedPlayer.years_exp !== null && <InfoBox label="Experience" value={`${selectedPlayer.years_exp} yrs`} />}
          {selectedPlayer.college && <InfoBox label="College" value={selectedPlayer.college} />}
          {selectedPlayer.depth_chart_order && <InfoBox label="Depth Chart" value={`#${selectedPlayer.depth_chart_order}`} />}
          {selectedPlayer.status && <InfoBox label="Status" value={selectedPlayer.status} />}
          {selectedPlayer.search_rank && <InfoBox label="Search Rank" value={`#${selectedPlayer.search_rank}`} />}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-sky-500/10 rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Proj. Points</p><p className="text-lg font-bold text-sky-500">{(selectedPlayer.projected_points ?? 0).toFixed(1)}</p></div>
          <div className="flex-1 bg-emerald-500/10 rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Live Points</p><p className="text-lg font-bold text-emerald-500">{(selectedPlayer.live_points ?? 0).toFixed(1)}</p></div>
        </div>
        {selectedPlayer.injury_notes && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2"><p className="text-xs font-medium text-red-500 mb-0.5">Injury Report</p><p className="text-xs text-slate-600 dark:text-slate-300">{selectedPlayer.injury_notes}</p></div>}
      </div>
    </div>
  );

  // ─── LEAGUE DETAIL VIEW ───
  if (view === 'league' && selectedLeague) {
    const tabs: { key: typeof activeTab; label: string; icon: any }[] = [
      { key: 'matchup', label: 'Matchup', icon: TrendingUp },
      { key: 'standings', label: 'Standings', icon: Trophy },
      { key: 'roster', label: 'Roster', icon: Users },
      { key: 'players', label: 'Players', icon: Activity },
      { key: 'draft', label: 'Draft', icon: Zap },
      { key: 'waiver', label: 'Waiver', icon: TrendingUp },
      { key: 'trades', label: 'Trades', icon: ArrowRightLeft },
      { key: 'chat', label: 'Chat', icon: Activity },
      { key: 'settings', label: 'Settings', icon: Settings },
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">{isSleeperLeague ? <Download size={15} className="text-sky-500" /> : <Trophy size={15} className="text-sky-500" />}{selectedLeague.name}</h3>
            <p className="text-xs text-slate-500">{isSleeperLeague && <span className="text-sky-500">Sleeper League · </span>}{nflState && `Week ${nflState.week} · `}{selectedLeague.draft_status === 'not_started' && (selectedLeague.draft_time ? `Draft: ${new Date(selectedLeague.draft_time).toLocaleString()}` : 'No draft time set')}{selectedLeague.draft_status === 'drafting' && 'Drafting live now'}{selectedLeague.draft_status === 'completed' && 'Season in progress'}</p>
          </div>
          {isSleeperLeague && <button onClick={refreshSleeperData} disabled={detailLoading} className="text-slate-400 hover:text-sky-500 transition-colors"><RefreshCw size={16} className={detailLoading ? 'animate-spin' : ''} /></button>}
          {isOwner && selectedLeague.draft_status === 'not_started' && !isSleeperLeague && <button onClick={startDraft} className="text-xs font-medium text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg bg-sky-500/10">Start Draft</button>}
        </div>
        <div className="flex gap-1 border-b border-slate-200 dark:border-white/5 overflow-x-auto scrollbar-thin">
          {tabs.map(tab => <button key={tab.key} onClick={() => { setActiveTab(tab.key); if ((tab.key === 'draft' || tab.key === 'waiver' || tab.key === 'players') && players.length === 0) loadPlayers(); if (tab.key === 'waiver' && trending.length === 0) loadTrending('add'); }} className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all flex items-center gap-1 ${activeTab === tab.key ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><tab.icon size={12} />{tab.label}</button>)}
        </div>
        <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
          {detailLoading && <div className="flex justify-center py-4"><BubbleLoader size={28} /></div>}

          {/* MATCHUP */}
          {!detailLoading && activeTab === 'matchup' && <div className="space-y-3">
            {isSleeperLeague && matchupPairs.length > 0 ? (<>
              {myMatchup && opponentMatchup && <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 space-y-2"><p className="text-xs font-semibold text-sky-500 uppercase">Your Matchup</p><div className="flex items-center gap-2"><div className="flex-1 text-center"><p className="text-sm font-bold text-slate-900 dark:text-white">{sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === myMatchup.roster_id)?.owner_id === u.user_id)?.display_name ?? 'You'}</p><p className="text-2xl font-bold text-sky-500">{myMatchup.points.toFixed(2)}</p><p className="text-xs text-slate-500">vs</p><p className="text-sm font-bold text-slate-900 dark:text-white">{sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === opponentMatchup.roster_id)?.owner_id === u.user_id)?.display_name ?? 'Opponent'}</p><p className="text-2xl font-bold text-slate-400">{opponentMatchup.points.toFixed(2)}</p></div></div><div className="space-y-1"><p className="text-xs font-semibold text-slate-400 uppercase">Your Starters</p>{myMatchup.starters.map((pid, i) => { const p = playerMap[pid]; const pts = myMatchup.starters_points?.[i] ?? 0; return <button key={i} onClick={() => { if (p) { setSelectedPlayer(p); setView('player'); } }} className="w-full flex items-center gap-2 text-xs py-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded"><span className="w-12 text-slate-400 font-medium">{p?.position ?? '??'}</span><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{p?.name ?? pid}</span><span className="font-semibold text-emerald-500">{pts.toFixed(2)}</span></button>; })}</div></div>}
              <p className="text-xs font-semibold text-slate-400 uppercase">All Matchups · Week {nflState?.week ?? 1}</p>
              {matchupPairs.map((pair, i) => { const isMine = pair.home.roster_id === mySleeperRoster?.roster_id || pair.away.roster_id === mySleeperRoster?.roster_id; return <div key={i} className={`rounded-xl p-3 ${isMine ? 'bg-sky-500/5 border border-sky-500/10' : 'bg-slate-100 dark:bg-white/5'}`}><div className="flex items-center justify-between"><div className="flex-1 text-center"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pair.homeUser?.display_name ?? 'Team'}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{pair.home.points.toFixed(2)}</p></div><span className="text-xs text-slate-400 px-2">vs</span><div className="flex-1 text-center"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pair.awayUser?.display_name ?? 'Team'}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{pair.away.points.toFixed(2)}</p></div></div></div>; })}
            </>) : !isSleeperLeague ? <div className="text-center py-8"><Activity size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">{selectedLeague.draft_status === 'completed' ? 'Matchups will be generated after the draft completes' : 'Complete the draft to start head-to-head matchups'}</p></div> : <div className="text-center py-8"><RefreshCw size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">{sleeperError ? 'Could not load from Sleeper.' : 'Loading matchup data from Sleeper...'}</p>{sleeperError && <p className="text-xs text-red-400 mt-1 px-4">{sleeperError}</p>}<button onClick={refreshSleeperData} className="mt-2 text-xs text-sky-500 hover:text-sky-400">Retry</button></div>}
          </div>}

          {/* STANDINGS */}
          {!detailLoading && activeTab === 'standings' && <div className="space-y-1">
            {isSleeperLeague && sleeperRosters.length > 0 ? [...sleeperRosters].sort((a, b) => (b.settings.wins - a.settings.wins) || (b.settings.fpts - a.settings.fpts)).map((r, i) => { const u = sleeperUsers.find(su => su.user_id === r.owner_id); return <div key={r.roster_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5"><span className="text-sm font-bold text-slate-400 w-6">#{i + 1}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{u?.display_name ?? 'Unknown'}</p><p className="text-xs text-slate-500">{r.settings.wins}-{r.settings.losses}-{r.settings.ties} · {r.settings.fpts}{r.settings.fpts_decimal ? `.${r.settings.fpts_decimal}` : ''} PF</p></div>{r.settings.fpts_against > 0 && <span className="text-xs text-slate-400">{r.settings.fpts_against} PA</span>}</div>; }) : members.length === 0 ? <p className="text-center text-slate-500 text-xs py-8">No members yet</p> : [...members].sort((a, b) => (b.wins - a.wins) || (b.points_for - a.points_for)).map((m, i) => <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5"><span className="text-sm font-bold text-slate-400 w-6">#{i + 1}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{m.team_name}</p><p className="text-xs text-slate-500">{m.wins}-{m.losses}-{m.ties} · {m.points_for.toFixed(1)} PF</p></div></div>)}
          </div>}

          {/* ROSTER */}
          {!detailLoading && activeTab === 'roster' && <div className="space-y-2">
            {isSleeperLeague && mySleeperRoster ? (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">Your Team</p>
              {mySleeperRoster.starters.map((pid, i) => { const p = playerMap[pid]; const livePts = myMatchup?.starters_points?.[i] ?? 0; return <button key={i} onClick={() => { if (p) { setSelectedPlayer(p); setView('player'); } }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all text-left"><span className="w-10 text-xs font-bold text-sky-500">{p?.position ?? '??'}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p?.name ?? pid}</p><p className="text-xs text-slate-500">{p?.team ?? ''} {p?.injury_status ? `· ${p.injury_status}` : ''}</p></div><span className="text-xs font-semibold text-emerald-500">{livePts.toFixed(2)}</span></button>; })}
              {mySleeperRoster.players.filter(pid => !mySleeperRoster.starters.includes(pid)).map(pid => { const p = playerMap[pid]; return <button key={pid} onClick={() => { if (p) { setSelectedPlayer(p); setView('player'); } }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-left"><span className="w-10 text-xs font-bold text-slate-400">BENCH</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p?.name ?? pid}</p><p className="text-xs text-slate-500">{p?.team ?? ''} {p?.position ?? ''}</p></div></button>; })}
              <p className="text-xs font-semibold text-slate-400 uppercase pt-2">Other Teams</p>
              {sleeperRosters.filter(r => r.roster_id !== mySleeperRoster?.roster_id).map(r => { const u = sleeperUsers.find(su => su.user_id === r.owner_id); return <div key={r.roster_id} className="pt-1"><p className="text-xs font-semibold text-slate-500 mb-1">{u?.display_name ?? 'Unknown'}</p><div className="flex flex-wrap gap-1">{r.starters.map(pid => { const p = playerMap[pid]; return <button key={pid} onClick={() => { if (p) { setSelectedPlayer(p); setView('player'); } }} className="text-xs bg-slate-100 dark:bg-white/5 rounded px-2 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10">{p?.name ?? pid} ({p?.position ?? '?'})</button>; })}</div></div>; })}
            </>) : (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">Your Team — {myMember?.team_name ?? 'N/A'}</p>
              {myRoster.length === 0 ? <p className="text-center text-slate-500 text-xs py-8">No players on your roster yet</p> : myRoster.map(r => <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{r.player?.name}</p><p className="text-xs text-slate-500">{r.player?.position} · {r.player?.team} {r.is_starter ? '· Starting' : '· Bench'}</p></div><span className="text-xs font-semibold text-sky-500">{(r.player?.live_points ?? 0).toFixed(1)} pts</span></div>)}
              {members.filter(m => m.user_id !== user?.id).map(m => { const theirRoster = rosters.filter(r => r.member_id === m.id); if (theirRoster.length === 0) return null; return <div key={m.id} className="pt-2"><p className="text-xs font-semibold text-slate-400 uppercase mb-1">{m.team_name}</p>{theirRoster.map(r => <div key={r.id} className="flex items-center gap-2 px-2 py-1 text-xs"><span className="text-slate-700 dark:text-slate-200 flex-1">{r.player?.name}</span><span className="text-slate-500">{r.player?.position}</span></div>)}</div>; })}
            </>)}
          </div>}

          {/* PLAYERS */}
          {!detailLoading && activeTab === 'players' && <div className="space-y-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Search all players..." className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
            <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
              {allPlayersFiltered.map(p => <button key={p.player_id} onClick={() => { setSelectedPlayer(p); setView('player'); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-left"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team}{p.injury_status && <span className={injuryColor(p.injury_status)}> · {p.injury_status}</span>}</p></div><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)}</span></button>)}
              {allPlayersFiltered.length === 0 && <p className="text-center text-slate-500 text-xs py-4">{players.length === 0 ? 'Loading players...' : 'No players found'}</p>}
            </div>
          </div>}

          {/* DRAFT */}
          {!detailLoading && activeTab === 'draft' && <div className="space-y-3">
            {selectedLeague.draft_status === 'drafting' && <div className={`text-center py-2 rounded-xl ${isMyTurn ? 'bg-sky-500/10 text-sky-500' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>{isMyTurn ? "It's your turn to pick!" : `Waiting for team ${currentPickPos} to pick (Pick #${draftPicks.length + 1})`}</div>}
            {isSleeperLeague && sleeperLeagueInfo ? <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3"><p className="text-xs text-sky-600 dark:text-sky-300">Draft data is managed by Sleeper. Draft results will appear once the draft is complete.</p></div> : (<>
              {draftPicks.length > 0 && <div className="space-y-1"><p className="text-xs font-semibold text-slate-400 uppercase">Draft History</p>{draftPicks.slice(-15).reverse().map(pick => <div key={pick.id} className="flex items-center gap-2 text-xs py-1"><span className="text-slate-400 w-8">#{pick.pick_number}</span><span className="font-medium text-slate-700 dark:text-slate-200 flex-1">{pick.player?.name}</span><span className="text-slate-500">{pick.player?.position} · {pick.player?.team}</span></div>)}</div>}
              {selectedLeague.draft_status === 'drafting' && isMyTurn && <div className="space-y-2"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Search players..." className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500/30" /></div><div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">{allPlayersFiltered.map(p => <button key={p.player_id} onClick={() => draftPlayer(p)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-left"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team} {p.injury_status ? `· ${p.injury_status}` : ''}</p></div><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)} pts</span><Trophy size={14} className="text-sky-500" /></button>)}</div></div>}
              {selectedLeague.draft_status === 'not_started' && <div className="text-center py-8"><Clock size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">{selectedLeague.draft_time ? `Draft starts ${new Date(selectedLeague.draft_time).toLocaleString()}` : 'No draft time set'}</p>{isOwner && <button onClick={startDraft} className="mt-3 text-xs font-medium text-sky-500 hover:text-sky-400 px-3 py-1.5 rounded-lg bg-sky-500/10">Start Draft Now</button>}</div>}
            </>)}
          </div>}

          {/* WAIVER */}
          {!detailLoading && activeTab === 'waiver' && <div className="space-y-3">
            <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1"><TrendingUp size={12} /> Trending {trendingType === 'add' ? 'Adds' : 'Drops'}</p><div className="flex gap-1"><button onClick={() => loadTrending('add')} className={`text-xs px-2 py-1 rounded ${trendingType === 'add' ? 'bg-emerald-500/20 text-emerald-500' : 'text-slate-400'}`}>Adds</button><button onClick={() => loadTrending('drop')} className={`text-xs px-2 py-1 rounded ${trendingType === 'drop' ? 'bg-red-500/20 text-red-500' : 'text-slate-400'}`}>Drops</button></div></div>{trending.length === 0 ? <p className="text-center text-slate-500 text-xs py-2">Loading trending players...</p> : <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">{trending.slice(0, 15).map(p => <button key={p.player_id} onClick={() => { setSelectedPlayer(p); setView('player'); }} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-left"><span className="text-xs font-medium text-slate-900 dark:text-white flex-1">{p.name}</span><span className="text-xs text-slate-500">{p.position} · {p.team}</span><span className="text-xs text-slate-400">{p.count ?? 0}</span></button>)}</div>}</div>
            <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Available Players</p><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={waiverSearch} onChange={e => setWaiverSearch(e.target.value)} placeholder="Search available players..." className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500/30" /></div><div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">{waiverPlayers.map(p => <button key={p.player_id} onClick={() => { setSelectedPlayer(p); setView('player'); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-left"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team}{p.injury_status && <span className={injuryColor(p.injury_status)}> · {p.injury_status}</span>}</p></div><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)}</span></button>)}{waiverPlayers.length === 0 && <p className="text-center text-slate-500 text-xs py-4">{players.length === 0 ? 'Loading players...' : 'No players found'}</p>}</div></div>
          </div>}

          {/* TRADES */}
          {!detailLoading && activeTab === 'trades' && <div className="space-y-3">
            {myMember && members.filter(m => m.user_id !== user?.id).length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Propose a Trade</p>{!tradeTarget ? <div className="space-y-1">{members.filter(m => m.user_id !== user?.id).map(m => <button key={m.id} onClick={() => { setTradeTarget(m); setOfferedPlayerIds([]); setRequestedPlayerIds([]); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-left"><ArrowRightLeft size={14} className="text-sky-500" /><span className="text-sm text-slate-900 dark:text-white">{m.team_name}</span></button>)}</div> : <div className="space-y-3 bg-sky-500/5 border border-sky-500/10 rounded-xl p-3"><div className="flex items-center justify-between"><p className="text-xs font-medium text-sky-500">Trading with {tradeTarget.team_name}</p><button onClick={() => setTradeTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button></div><div><p className="text-xs text-slate-500 mb-1">You offer:</p><div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">{myRoster.map(r => { const pid = r.player?.player_id ?? r.player_id; const isSelected = offeredPlayerIds.includes(pid); return <button key={r.id} onClick={() => setOfferedPlayerIds(prev => isSelected ? prev.filter(id => id !== pid) : [...prev, pid])} className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs ${isSelected ? 'bg-sky-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{r.player?.name}</span><span className="text-slate-400">{r.player?.position}</span>{isSelected && <Check size={12} className="text-sky-500" />}</button>; })}</div></div><div><p className="text-xs text-slate-500 mb-1">You want:</p><div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">{rosters.filter(r => r.member_id === tradeTarget.id).map(r => { const pid = r.player?.player_id ?? r.player_id; const isSelected = requestedPlayerIds.includes(pid); return <button key={r.id} onClick={() => setRequestedPlayerIds(prev => isSelected ? prev.filter(id => id !== pid) : [...prev, pid])} className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs ${isSelected ? 'bg-sky-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{r.player?.name}</span><span className="text-slate-400">{r.player?.position}</span>{isSelected && <Check size={12} className="text-sky-500" />}</button>; })}{rosters.filter(r => r.member_id === tradeTarget.id).length === 0 && <p className="text-xs text-slate-400 px-2 py-1">No players on this team</p>}</div></div><button onClick={proposeTrade} disabled={offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0} className="w-full py-2 bg-sky-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">Send Trade Offer</button></div>}</div>}
            {trades.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Trade History</p>{trades.map(t => { const proposer = members.find(m => m.id === t.proposer_member_id); const target = members.find(m => m.id === t.target_member_id); const isTarget = t.target_member_id === myMember?.id && t.status === 'pending'; return <div key={t.id} className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{proposer?.team_name ?? 'Unknown'} → {target?.team_name ?? 'Unknown'}</span><span className={`text-xs font-medium ${t.status === 'pending' ? 'text-sky-500' : t.status === 'accepted' ? 'text-emerald-500' : 'text-red-500'}`}>{t.status}</span></div><div className="flex items-center gap-2 text-xs text-slate-500"><div className="flex-1"><p className="font-medium">Offers:</p>{t.offered_player_ids.map(pid => { const p = playerMap[pid] ?? players.find(pl => pl.player_id === pid); return <p key={pid}>{p?.name ?? pid}</p>; })}</div><ArrowRightLeft size={14} className="text-slate-400" /><div className="flex-1"><p className="font-medium">Wants:</p>{t.requested_player_ids.map(pid => { const p = playerMap[pid] ?? players.find(pl => pl.player_id === pid); return <p key={pid}>{p?.name ?? pid}</p>; })}</div></div>{isTarget && <div className="flex gap-2 pt-1"><button onClick={() => respondToTrade(t, true)} className="flex-1 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">Accept</button><button onClick={() => respondToTrade(t, false)} className="flex-1 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium">Reject</button></div>}</div>; })}</div>}
            {trades.length === 0 && !tradeTarget && <p className="text-center text-slate-500 text-xs py-4">No trades yet. Propose one above!</p>}
          </div>}

          {/* CHAT */}
          {!detailLoading && activeTab === 'chat' && <div className="space-y-2">
            <div className="space-y-2 min-h-[200px]">
              {chatMsgs.length === 0 && <p className="text-center text-slate-500 text-xs py-8">No messages yet. Start chatting!</p>}
              {chatMsgs.map(msg => { const sender = members.find(m => m.user_id === msg.sender_id); const isMe = msg.sender_id === user?.id; const isSystem = msg.message_type === 'system' || msg.message_type === 'draft_pick'; if (isSystem) return <div key={msg.id} className="text-center py-1"><span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/5 rounded-full px-3 py-1">{msg.content}</span></div>; return <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isMe ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white'}`}>{!isMe && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{sender?.team_name ?? 'Unknown'}</p>}<p className="text-sm">{msg.content}</p></div></div>; })}
            </div>
            <div className="flex gap-2 sticky bottom-0 bg-white dark:bg-slate-900 pt-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder="Type a message..." className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500/30" />
              <button onClick={sendChat} disabled={sending || !chatInput.trim()} className="px-3 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium disabled:opacity-40">Send</button>
            </div>
          </div>}

          {/* SETTINGS */}
          {!detailLoading && activeTab === 'settings' && <div className="space-y-3">
            {!isOwner ? <p className="text-center text-slate-500 text-xs py-4">Only the league owner can change settings</p> : (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">League Settings</p>
              <SettingRow label="Scoring: Pass TD" value={selectedLeague.pass_td_pts} onChange={v => updateLeagueSettings({ pass_td_pts: v })} />
              <SettingRow label="Scoring: Pass YD (per)" value={selectedLeague.pass_yd_pts} onChange={v => updateLeagueSettings({ pass_yd_pts: v })} />
              <SettingRow label="Scoring: INT" value={selectedLeague.int_pts} onChange={v => updateLeagueSettings({ int_pts: v })} />
              <SettingRow label="Scoring: Rush TD" value={selectedLeague.rush_td_pts} onChange={v => updateLeagueSettings({ rush_td_pts: v })} />
              <SettingRow label="Scoring: Rush YD (per)" value={selectedLeague.rush_yd_pts} onChange={v => updateLeagueSettings({ rush_yd_pts: v })} />
              <SettingRow label="Scoring: Rec TD" value={selectedLeague.rec_td_pts} onChange={v => updateLeagueSettings({ rec_td_pts: v })} />
              <SettingRow label="Scoring: Rec YD (per)" value={selectedLeague.rec_yd_pts} onChange={v => updateLeagueSettings({ rec_yd_pts: v })} />
              <SettingRow label="Scoring: Per Reception (PPR)" value={selectedLeague.rec_pts} onChange={v => updateLeagueSettings({ rec_pts: v })} />
              <SettingRow label="Scoring: Fumble" value={selectedLeague.fumble_pts} onChange={v => updateLeagueSettings({ fumble_pts: v })} />
              <SettingRow label="Scoring: FG 0-39" value={selectedLeague.fg_0_39} onChange={v => updateLeagueSettings({ fg_0_39: v })} />
              <SettingRow label="Scoring: FG 40-49" value={selectedLeague.fg_40_49} onChange={v => updateLeagueSettings({ fg_40_49: v })} />
              <SettingRow label="Scoring: FG 50+" value={selectedLeague.fg_50_plus} onChange={v => updateLeagueSettings({ fg_50_plus: v })} />
              <SettingRow label="Scoring: XP" value={selectedLeague.xp_pts} onChange={v => updateLeagueSettings({ xp_pts: v })} />
              <SettingRow label="Roster: QB" value={selectedLeague.qb_count} onChange={v => updateLeagueSettings({ qb_count: v })} />
              <SettingRow label="Roster: RB" value={selectedLeague.rb_count} onChange={v => updateLeagueSettings({ rb_count: v })} />
              <SettingRow label="Roster: WR" value={selectedLeague.wr_count} onChange={v => updateLeagueSettings({ wr_count: v })} />
              <SettingRow label="Roster: TE" value={selectedLeague.te_count} onChange={v => updateLeagueSettings({ te_count: v })} />
              <SettingRow label="Roster: K" value={selectedLeague.k_count} onChange={v => updateLeagueSettings({ k_count: v })} />
              <SettingRow label="Roster: DEF" value={selectedLeague.def_count} onChange={v => updateLeagueSettings({ def_count: v })} />
              <SettingRow label="Roster: FLEX" value={selectedLeague.flex_count} onChange={v => updateLeagueSettings({ flex_count: v })} />
              <SettingRow label="Roster: Bench" value={selectedLeague.bench_count} onChange={v => updateLeagueSettings({ bench_count: v })} />
            </>)}
          </div>}
        </div>
        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
      </div>
    );
  }
  return null;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-medium text-slate-900 dark:text-white">{value}</p></div>;
}

function SettingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div className="flex items-center justify-between bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2"><span className="text-xs text-slate-600 dark:text-slate-300">{label}</span><input type="number" step="0.1" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="w-16 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:ring-1 focus:ring-sky-500/30" /></div>;
}
