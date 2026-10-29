import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  Trophy, Search, Clock, ChevronRight, Check, Users, X, ArrowRightLeft,
  TrendingUp, Activity, RefreshCw, Download, AlertCircle, Zap, Settings,
  ChevronLeft, MessageCircle, Calendar, Plus, MinusCircle, ArrowUp, ArrowDown,
} from 'lucide-react';
import BubbleLoader from './BubbleLoader';

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

async function sleeperAPI(action: string, params: Record<string, string> = {}): Promise<any> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nfl-stats?action=${action}`;
  const qs = Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const res = await fetch(`${apiUrl}${qs}`, {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
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

type Props = { leagueId: string };

export default function DraftPanel({ leagueId }: Props) {
  const { user } = useAuth();
  const [league, setLeague] = useState<FFLeague | null>(null);
  const [members, setMembers] = useState<FFMember[]>([]);
  const [draftPicks, setDraftPicks] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [players, setPlayers] = useState<FFPlayer[]>([]);
  const [playerMap, setPlayerMap] = useState<Record<string, FFPlayer>>({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [waiverSearch, setWaiverSearch] = useState('');
  const [myMember, setMyMember] = useState<FFMember | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matchup' | 'standings' | 'roster' | 'players' | 'draft' | 'waiver' | 'trades' | 'schedule' | 'chat' | 'settings'>('matchup');
  const [chatMsgs, setChatMsgs] = useState<FFChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [trades, setTrades] = useState<FFTrade[]>([]);
  const [tradeTarget, setTradeTarget] = useState<FFMember | null>(null);
  const [offeredPlayerIds, setOfferedPlayerIds] = useState<string[]>([]);
  const [requestedPlayerIds, setRequestedPlayerIds] = useState<string[]>([]);
  const [trending, setTrending] = useState<FFPlayer[]>([]);
  const [trendingType, setTrendingType] = useState<'add' | 'drop'>('add');
  const [selectedPlayer, setSelectedPlayer] = useState<FFPlayer | null>(null);
  const [nflState, setNflState] = useState<{ week: number; season: string; season_type: string } | null>(null);
  const [sleeperRosters, setSleeperRosters] = useState<SleeperRoster[]>([]);
  const [sleeperUsers, setSleeperUsers] = useState<SleeperUser[]>([]);
  const [sleeperMatchups, setSleeperMatchups] = useState<SleeperMatchup[]>([]);
  const [sleeperLeagueInfo, setSleeperLeagueInfo] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scheduleWeek, setScheduleWeek] = useState<number>(1);
  const [lineupEditing, setLineupEditing] = useState(false);
  const [pendingStarters, setPendingStarters] = useState<string[]>([]);
  const [savingLineup, setSavingLineup] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const playersLoaded = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { sleeperAPI('state').then(setNflState).catch(() => {}); }, []);

  const loadLeagueData = useCallback(async () => {
    if (!leagueId) return;
    const [leagueRes, memRes, picksRes, rosterRes, chatRes, tradeRes] = await Promise.all([
      supabase.from('ff_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.from('ff_league_members').select('*').eq('league_id', leagueId),
      supabase.from('ff_draft_picks').select('*, player:ff_players(*)').eq('league_id', leagueId).order('pick_number', { ascending: true }),
      supabase.from('ff_rosters').select('*, player:ff_players(*), member:ff_league_members(*)').eq('league_id', leagueId),
      supabase.from('ff_chat_messages').select('*').eq('league_id', leagueId).order('created_at', { ascending: true }).limit(200),
      supabase.from('ff_trades').select('*').eq('league_id', leagueId).order('proposed_at', { ascending: false }),
    ]);
    setLeague(leagueRes.data as FFLeague ?? null);
    setMembers((memRes.data as FFMember[]) ?? []);
    setDraftPicks((picksRes.data as any[]) ?? []);
    setRosters((rosterRes.data as any[]) ?? []);
    setChatMsgs((chatRes.data as FFChatMsg[]) ?? []);
    setTrades((tradeRes.data as FFTrade[]) ?? []);
    if (user) {
      const me = ((memRes.data as FFMember[]) ?? []).find(m => m.user_id === user.id);
      setMyMember(me ?? null);
    }
    setLoading(false);
  }, [leagueId, user]);

  useEffect(() => { loadLeagueData(); }, [loadLeagueData]);

  useEffect(() => {
    if (!leagueId) return;
    const channel = supabase.channel(`ff_draft_${leagueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_draft_picks', filter: `league_id=eq.${leagueId}` }, () => loadLeagueData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_rosters', filter: `league_id=eq.${leagueId}` }, () => loadLeagueData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ff_leagues', filter: `id=eq.${leagueId}` }, (payload: any) => setLeague(prev => prev ? { ...prev, ...payload.new } : prev))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_chat_messages', filter: `league_id=eq.${leagueId}` }, (payload: any) => { setChatMsgs(prev => [...prev, payload.new as FFChatMsg]); setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 50); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ff_trades', filter: `league_id=eq.${leagueId}` }, () => loadLeagueData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ff_trades', filter: `league_id=eq.${leagueId}` }, () => loadLeagueData())
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [leagueId, loadLeagueData]);

  // Load Sleeper data when league has sleeper_league_id
  useEffect(() => {
    if (!league?.sleeper_league_id) return;
    loadSleeperData(league.sleeper_league_id);
  }, [league?.sleeper_league_id]);

  async function loadSleeperData(sleeperLeagueId: string) {
    setDetailLoading(true);
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
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  async function loadPlayers() {
    if (playersLoaded.current) return;
    playersLoaded.current = true;
    setPlayersLoading(true);
    try {
      const { data: dbPlayers } = await supabase.from('ff_players').select('*').order('projected_points', { ascending: false }).limit(500);
      if (dbPlayers && dbPlayers.length > 0) {
        const mapped = dbPlayers as FFPlayer[];
        setPlayers(mapped);
        const map: Record<string, FFPlayer> = {};
        mapped.forEach(p => { map[p.player_id] = p; });
        setPlayerMap(map);
        setPlayersLoading(false);
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
    finally { setPlayersLoading(false); }
  }

  useEffect(() => { loadPlayers(); }, []);

  async function loadTrending(type: 'add' | 'drop') {
    setTrendingType(type);
    try {
      const data = await sleeperAPI('trending', { type, lookback: '24', limit: '50' });
      setTrending(data.players ?? []);
    } catch { /* ignore */ }
  }

  function snakeDraftPosition(pickIndex: number, numTeams: number): number {
    const round = Math.floor(pickIndex / numTeams);
    const posInRound = pickIndex % numTeams;
    if (round % 2 === 0) return posInRound + 1;
    return numTeams - posInRound;
  }

  async function draftPlayer(player: FFPlayer) {
    if (!league || !myMember || !user) return;
    if (league.draft_status !== 'drafting') { setError('Draft has not started'); return; }
    const teamsCount = league.num_teams ?? 10;
    const totalPicks = draftPicks.length;
    const round = Math.floor(totalPicks / teamsCount) + 1;
    const pickNum = totalPicks + 1;
    const expectedPos = snakeDraftPosition(totalPicks, teamsCount);
    if (myMember.draft_position !== expectedPos) { setError('Not your turn to pick'); return; }
    let playerId = player.id;
    if (!playerId) {
      const { data: upserted } = await supabase.from('ff_players').upsert({
        player_id: player.player_id, name: player.name, team: player.team,
        position: player.position, projected_points: player.projected_points, season: league.season,
      }, { onConflict: 'player_id' }).select().single();
      playerId = upserted?.id;
    }
    if (!playerId) { setError('Failed to save player'); return; }
    const { error: pe } = await supabase.from('ff_draft_picks').insert({ league_id: league.id, member_id: myMember.id, player_id: playerId, round, pick_number: pickNum });
    if (pe) { setError(pe.message); return; }
    await supabase.from('ff_rosters').insert({ league_id: league.id, member_id: myMember.id, player_id: playerId, is_starter: false });
    await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content: `${myMember.team_name} drafted ${player.name} (${player.position ?? 'N/A'}, ${player.team ?? 'N/A'})`, message_type: 'draft_pick', player_id: playerId });
    setPlayerSearch(''); setError('');
    loadLeagueData();
  }

  async function startDraft() {
    if (!league || !user || league.owner_id !== user.id) return;
    setLeague({ ...league, draft_status: 'drafting' });
    setActiveTab('draft');
    supabase.from('ff_leagues').update({ draft_status: 'drafting', current_pick_index: 0 }).eq('id', league.id);
    supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content: 'The draft has started!', message_type: 'system' });
  }

  async function sendChat() {
    if (!chatInput.trim() || !league || !user || sending) return;
    setSending(true);
    const content = chatInput.trim();
    setChatInput('');
    await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content, message_type: 'text' });
    setSending(false);
  }

  async function proposeTrade() {
    if (!league || !myMember || !tradeTarget) return;
    if (offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0) { setError('Select players from both sides'); return; }
    const { error: te } = await supabase.from('ff_trades').insert({
      league_id: league.id, proposer_member_id: myMember.id, target_member_id: tradeTarget.id,
      offered_player_ids: offeredPlayerIds, requested_player_ids: requestedPlayerIds, status: 'pending',
    });
    if (te) { setError(te.message); return; }
    await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user!.id, content: `${myMember.team_name} proposed a trade with ${tradeTarget.team_name}`, message_type: 'system' });
    setTradeTarget(null); setOfferedPlayerIds([]); setRequestedPlayerIds([]);
    loadLeagueData();
  }

  async function respondToTrade(trade: FFTrade, accept: boolean) {
    if (!league || !user) return;
    const status = accept ? 'accepted' : 'rejected';
    await supabase.from('ff_trades').update({ status, resolved_at: new Date().toISOString() }).eq('id', trade.id);
    if (accept) {
      const offeredRosters = rosters.filter(r => r.member_id === trade.proposer_member_id && trade.offered_player_ids.includes(r.player?.player_id));
      const requestedRosters = rosters.filter(r => r.member_id === trade.target_member_id && trade.requested_player_ids.includes(r.player?.player_id));
      for (const r of offeredRosters) await supabase.from('ff_rosters').update({ member_id: trade.target_member_id }).eq('id', r.id);
      for (const r of requestedRosters) await supabase.from('ff_rosters').update({ member_id: trade.proposer_member_id }).eq('id', r.id);
      await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content: 'A trade was accepted and rosters have been updated', message_type: 'system' });
    }
    loadLeagueData();
  }

  async function updateLeagueSettings(updates: Record<string, any>) {
    if (!league || !user || league.owner_id !== user.id) return;
    const { error: ue } = await supabase.from('ff_leagues').update(updates).eq('id', league.id);
    if (ue) { setError(ue.message); return; }
    setLeague({ ...league, ...updates });
  }

  // Toggle a player between starter and bench (local league, not Sleeper)
  async function toggleStarter(rosterId: string, currentPlayerId: string, isStarter: boolean) {
    if (!league) return;
    await supabase.from('ff_rosters').update({ is_starter: !isStarter }).eq('id', rosterId);
    loadLeagueData();
  }

  // Save lineup for Sleeper league (updates local pending starters then syncs)
  async function saveSleeperLineup() {
    if (!mySleeperRoster || !league) return;
    setSavingLineup(true);
    try {
      // For Sleeper leagues, we can't directly modify rosters via API (no write access).
      // We store the preferred lineup locally for display purposes.
      // In a full implementation this would call Sleeper's roster update endpoint.
      setLineupEditing(false);
      loadSleeperData(league.sleeper_league_id!);
    } catch { /* ignore */ }
    finally { setSavingLineup(false); }
  }

  // Add a player from waivers (local league)
  async function addPlayer(player: FFPlayer) {
    if (!league || !myMember || !user) return;
    let playerId = player.id;
    if (!playerId) {
      const { data: upserted } = await supabase.from('ff_players').upsert({
        player_id: player.player_id, name: player.name, team: player.team,
        position: player.position, projected_points: player.projected_points, season: league.season,
      }, { onConflict: 'player_id' }).select().single();
      playerId = upserted?.id;
    }
    if (!playerId) return;
    await supabase.from('ff_rosters').insert({ league_id: league.id, member_id: myMember.id, player_id: playerId, is_starter: false });
    await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content: `${myMember.team_name} added ${player.name} (${player.position ?? 'N/A'}, ${player.team ?? 'N/A'})`, message_type: 'system' });
    loadLeagueData();
  }

  // Drop a player from your roster (local league)
  async function dropPlayer(rosterId: string, playerName: string) {
    if (!league || !myMember || !user) return;
    await supabase.from('ff_rosters').delete().eq('id', rosterId);
    await supabase.from('ff_chat_messages').insert({ league_id: league.id, sender_id: user.id, content: `${myMember.team_name} dropped ${playerName}`, message_type: 'system' });
    loadLeagueData();
  }

  // ─── Computed ───
  const isOwner = league?.owner_id === user?.id;
  const isSleeperLeague = !!league?.sleeper_league_id;
  const draftedPlayerIds = new Set(draftPicks.map(dp => dp.player?.player_id ?? dp.player_id));
  const myRoster = rosters.filter(r => r.member_id === myMember?.id);
  const teamsCount = league?.num_teams ?? 10;
  const currentPickPos = snakeDraftPosition(draftPicks.length, teamsCount);
  const isMyTurn = league?.draft_status === 'drafting' && myMember?.draft_position === currentPickPos;

  const mySleeperRoster = sleeperRosters.find(r => {
    const su = sleeperUsers.find(u => u.user_id === r.owner_id);
    return su?.username === league?.sleeper_username || r.owner_id === sleeperUser?.user_id;
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

  const filteredPlayers = players.filter(p => {
    if (draftedPlayerIds.has(p.player_id)) return false;
    if (playerSearch.trim()) { const q = playerSearch.toLowerCase(); if (!p.name.toLowerCase().includes(q) && !(p.team ?? '').toLowerCase().includes(q)) return false; }
    return true;
  }).sort((a, b) => (b.projected_points ?? 0) - (a.projected_points ?? 0)).slice(0, 50);

  const waiverPlayers = players.filter(p => !rosteredPlayerIds.has(p.player_id))
    .filter(p => !waiverSearch.trim() || p.name.toLowerCase().includes(waiverSearch.toLowerCase()) || (p.team ?? '').toLowerCase().includes(waiverSearch.toLowerCase()))
    .sort((a, b) => (b.projected_points ?? 0) - (a.projected_points ?? 0)).slice(0, 50);

  const allPlayersFiltered = players
    .filter(p => !playerSearch.trim() || p.name.toLowerCase().includes(playerSearch.toLowerCase()) || (p.team ?? '').toLowerCase().includes(playerSearch.toLowerCase()))
    .sort((a, b) => (b.projected_points ?? 0) - (a.projected_points ?? 0)).slice(0, 100);

  if (loading) return <div className="flex justify-center py-8"><BubbleLoader size={32} /></div>;
  if (!league) return <p className="text-center text-slate-500 text-sm py-8">League not found</p>;

  // ─── Player detail overlay ───
  if (selectedPlayer) {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-white/[0.05]">
          <button onClick={() => setSelectedPlayer(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={18} /></button>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Activity size={16} className="text-sky-500" /> {selectedPlayer.name}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-4 space-y-3 max-w-md mx-auto">
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
      </div>
    );
  }

  const tabs: { key: typeof activeTab; label: string; icon: any }[] = [
    { key: 'matchup', label: 'Matchup', icon: TrendingUp },
    { key: 'standings', label: 'Standings', icon: Trophy },
    { key: 'roster', label: 'Roster', icon: Users },
    { key: 'players', label: 'Players', icon: Activity },
    { key: 'draft', label: 'Draft', icon: Zap },
    { key: 'waiver', label: 'Waiver', icon: TrendingUp },
    { key: 'trades', label: 'Trades', icon: ArrowRightLeft },
    { key: 'schedule', label: 'Schedule', icon: Clock },
    { key: 'chat', label: 'Chat', icon: MessageCircle },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-white/[0.05] bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSleeperLeague ? <Download size={16} className="text-sky-500" /> : <Trophy size={16} className="text-sky-500" />}
            <span className="text-sm font-bold text-slate-900 dark:text-white">{league.name}</span>
            {isSleeperLeague && <span className="text-xs text-sky-500 font-medium">Sleeper</span>}
          </div>
          <div className="flex items-center gap-2">
            {nflState && <span className="text-xs text-slate-500">Week {nflState.week}</span>}
            {isSleeperLeague && <button onClick={() => loadSleeperData(league.sleeper_league_id!)} disabled={detailLoading} className="text-slate-400 hover:text-sky-500 transition-colors"><RefreshCw size={14} className={detailLoading ? 'animate-spin' : ''} /></button>}
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${league.draft_status === 'drafting' ? 'bg-sky-500/15 text-sky-500' : league.draft_status === 'completed' ? 'bg-green-500/15 text-green-500' : 'bg-slate-200 dark:bg-white/5 text-slate-500'}`}>
              {league.draft_status === 'drafting' ? 'Drafting Live' : league.draft_status === 'completed' ? 'Season Active' : 'Draft Pending'}
            </span>
          </div>
        </div>
        {league.draft_status === 'drafting' && (
          <div className={`mt-2 text-center py-1.5 rounded-lg text-xs font-medium ${isMyTurn ? 'bg-sky-500/15 text-sky-500' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
            {isMyTurn ? "It's your turn to pick!" : `Waiting for team ${currentPickPos} (Pick #${draftPicks.length + 1})`}
          </div>
        )}
        {league.draft_status === 'not_started' && isOwner && !isSleeperLeague && (
          <button onClick={startDraft} className="mt-2 w-full py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg transition-all">Start Draft Now</button>
        )}
        {league.draft_status === 'not_started' && !isOwner && (
          <p className="mt-2 text-center text-xs text-slate-500">{league.draft_time ? `Draft: ${new Date(league.draft_time).toLocaleString()}` : 'Waiting for owner to start draft'}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-1 border-b border-slate-200 dark:border-white/[0.05] overflow-x-auto scrollbar-thin px-2">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); if ((tab.key === 'draft' || tab.key === 'waiver' || tab.key === 'players') && players.length === 0) loadPlayers(); if (tab.key === 'waiver' && trending.length === 0) loadTrending('add'); }} className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all flex items-center gap-1 ${activeTab === tab.key ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <tab.icon size={12} />{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {detailLoading && <div className="flex justify-center py-4"><BubbleLoader size={24} /></div>}

        {/* MATCHUP */}
        {!detailLoading && activeTab === 'matchup' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {isSleeperLeague && matchupPairs.length > 0 ? (<>
              {myMatchup && opponentMatchup && (
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-sky-500 uppercase">Your Matchup</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-center"><p className="text-sm font-bold text-slate-900 dark:text-white">{sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === myMatchup.roster_id)?.owner_id === u.user_id)?.display_name ?? 'You'}</p><p className="text-3xl font-bold text-sky-500">{myMatchup.points.toFixed(2)}</p></div>
                    <span className="text-xs text-slate-400">vs</span>
                    <div className="flex-1 text-center"><p className="text-sm font-bold text-slate-900 dark:text-white">{sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === opponentMatchup.roster_id)?.owner_id === u.user_id)?.display_name ?? 'Opponent'}</p><p className="text-3xl font-bold text-slate-400">{opponentMatchup.points.toFixed(2)}</p></div>
                  </div>
                  <div className="space-y-1"><p className="text-xs font-semibold text-slate-400 uppercase">Your Starters</p>
                    {myMatchup.starters.map((pid, i) => { const p = playerMap[pid]; const pts = myMatchup.starters_points?.[i] ?? 0; return <button key={i} onClick={() => { if (p) setSelectedPlayer(p); }} className="w-full flex items-center gap-2 text-xs py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded"><span className="w-12 text-slate-400 font-medium">{p?.position ?? '??'}</span><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{p?.name ?? pid}</span><span className="font-semibold text-emerald-500">{pts.toFixed(2)}</span></button>; })}
                  </div>
                </div>
              )}
              <p className="text-xs font-semibold text-slate-400 uppercase">All Matchups · Week {nflState?.week ?? 1}</p>
              {matchupPairs.map((pair, i) => { const isMine = pair.home.roster_id === mySleeperRoster?.roster_id || pair.away.roster_id === mySleeperRoster?.roster_id; return <div key={i} className={`rounded-xl p-3 ${isMine ? 'bg-sky-500/5 border border-sky-500/10' : 'bg-white dark:bg-white/5'}`}><div className="flex items-center justify-between"><div className="flex-1 text-center"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pair.homeUser?.display_name ?? 'Team'}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{pair.home.points.toFixed(2)}</p></div><span className="text-xs text-slate-400 px-2">vs</span><div className="flex-1 text-center"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pair.awayUser?.display_name ?? 'Team'}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{pair.away.points.toFixed(2)}</p></div></div></div>; })}
            </>) : !isSleeperLeague ? <div className="text-center py-8"><Activity size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">{league.draft_status === 'completed' ? 'Matchups will be generated after the draft completes' : 'Complete the draft to start head-to-head matchups'}</p></div> : <div className="text-center py-8"><RefreshCw size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">Loading matchup data from Sleeper...</p><button onClick={() => loadSleeperData(league.sleeper_league_id!)} className="mt-2 text-xs text-sky-500 hover:text-sky-400">Retry</button></div>}
          </div>
        )}

        {/* STANDINGS */}
        {!detailLoading && activeTab === 'standings' && (
          <div className="space-y-1 max-w-2xl mx-auto">
            {isSleeperLeague && sleeperRosters.length > 0 ? [...sleeperRosters].sort((a, b) => (b.settings.wins - a.settings.wins) || (b.settings.fpts - a.settings.fpts)).map((r, i) => { const u = sleeperUsers.find(su => su.user_id === r.owner_id); return <div key={r.roster_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-white/5"><span className="text-sm font-bold text-slate-400 w-6">#{i + 1}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{u?.display_name ?? 'Unknown'}</p><p className="text-xs text-slate-500">{r.settings.wins}-{r.settings.losses}-{r.settings.ties} · {r.settings.fpts}{r.settings.fpts_decimal ? `.${r.settings.fpts_decimal}` : ''} PF</p></div>{r.settings.fpts_against > 0 && <span className="text-xs text-slate-400">{r.settings.fpts_against} PA</span>}</div>; }) : members.length === 0 ? <p className="text-center text-slate-500 text-sm py-8">No members yet</p> : [...members].sort((a, b) => (b.wins - a.wins) || (b.points_for - a.points_for)).map((m, i) => <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-white/5"><span className="text-sm font-bold text-slate-400 w-6">#{i + 1}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{m.team_name}</p><p className="text-xs text-slate-500">{m.wins}-{m.losses}-{m.ties} · {m.points_for.toFixed(1)} PF</p></div></div>)}
          </div>
        )}

        {/* ROSTER */}
        {!detailLoading && activeTab === 'roster' && (
          <div className="space-y-2 max-w-2xl mx-auto">
            {isSleeperLeague && mySleeperRoster ? (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">Your Team</p>
              {mySleeperRoster.starters.map((pid, i) => { const p = playerMap[pid]; const livePts = myMatchup?.starters_points?.[i] ?? 0; return <button key={i} onClick={() => { if (p) setSelectedPlayer(p); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all text-left"><span className="w-10 text-xs font-bold text-sky-500">{p?.position ?? '??'}</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p?.name ?? pid}</p><p className="text-xs text-slate-500">{p?.team ?? ''} {p?.injury_status ? `· ${p.injury_status}` : ''}</p></div><span className="text-xs font-semibold text-emerald-500">{livePts.toFixed(2)}</span></button>; })}
              {mySleeperRoster.players.filter(pid => !mySleeperRoster.starters.includes(pid)).map(pid => { const p = playerMap[pid]; return <button key={pid} onClick={() => { if (p) setSelectedPlayer(p); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-left"><span className="w-10 text-xs font-bold text-slate-400">BENCH</span><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p?.name ?? pid}</p><p className="text-xs text-slate-500">{p?.team ?? ''} {p?.position ?? ''}</p></div></button>; })}
              <p className="text-xs font-semibold text-slate-400 uppercase pt-3">Other Teams</p>
              {sleeperRosters.filter(r => r.roster_id !== mySleeperRoster?.roster_id).map(r => { const u = sleeperUsers.find(su => su.user_id === r.owner_id); return <div key={r.roster_id} className="pt-2"><p className="text-xs font-semibold text-slate-500 mb-1.5">{u?.display_name ?? 'Unknown'} · {r.settings.wins}-{r.settings.losses}</p><div className="flex flex-wrap gap-1.5">{r.starters.map(pid => { const p = playerMap[pid]; return <button key={pid} onClick={() => { if (p) setSelectedPlayer(p); }} className="text-xs bg-white dark:bg-white/5 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-all">{p?.name ?? pid} <span className="text-slate-400">({p?.position ?? '?'})</span></button>; })}</div></div>; })}
            </>) : (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">Your Team — {myMember?.team_name ?? 'N/A'}</p>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setLineupEditing(e => !e)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${lineupEditing ? 'bg-sky-500 text-white' : 'bg-sky-500/10 text-sky-500 hover:bg-sky-500/20'}`}>
                  {lineupEditing ? 'Done' : 'Edit Lineup'}
                </button>
                {lineupEditing && <p className="text-xs text-slate-400">Tap a player to toggle starter/bench</p>}
              </div>
              {myRoster.length === 0 ? <p className="text-center text-slate-500 text-sm py-8">No players on your roster yet</p> : myRoster.map(r => {
                const isStarter = r.is_starter;
                return (
                  <div key={r.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{r.player?.name}</p>
                      <p className="text-xs text-slate-500">{r.player?.position} · {r.player?.team} {isStarter ? '· Starting' : '· Bench'}</p>
                    </div>
                    <span className="text-xs font-semibold text-sky-500">{(r.player?.live_points ?? 0).toFixed(1)} pts</span>
                    {lineupEditing && (
                      <button onClick={() => toggleStarter(r.id, r.player?.player_id ?? r.player_id, isStarter)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isStarter ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-400 hover:bg-sky-500/20 hover:text-sky-500'}`} title={isStarter ? 'Move to bench' : 'Move to starters'}>
                        {isStarter ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                      </button>
                    )}
                    {!lineupEditing && (
                      <button onClick={() => { if (confirm(`Drop ${r.player?.name}?`)) dropPlayer(r.id, r.player?.name ?? 'Unknown'); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100" title="Drop player">
                        <MinusCircle size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              <p className="text-xs font-semibold text-slate-400 uppercase pt-3">All Teams</p>
              {members.sort((a, b) => a.draft_position - b.draft_position).map(m => { const teamRoster = rosters.filter(r => r.member_id === m.id); return <div key={m.id} className="pt-2"><p className="text-xs font-semibold text-slate-500 mb-1.5">{m.team_name}</p><div className="flex flex-wrap gap-1.5">{teamRoster.length === 0 ? <span className="text-xs text-slate-400">No picks yet</span> : teamRoster.map(r => <span key={r.id} className="text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300">{r.player?.name} <span className="text-slate-400">({r.player?.position})</span></span>)}</div></div>; })}
            </>)}
          </div>
        )}

        {/* PLAYERS */}
        {!detailLoading && activeTab === 'players' && (
          <div className="space-y-2 max-w-2xl mx-auto">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Search all players..." className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
            {playersLoading && <div className="flex justify-center py-4"><BubbleLoader size={20} /></div>}
            <div className="space-y-1">
              {allPlayersFiltered.map(p => <button key={p.player_id} onClick={() => setSelectedPlayer(p)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-left"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team}{p.injury_status && <span className={injuryColor(p.injury_status)}> · {p.injury_status}</span>}</p></div><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)}</span></button>)}
              {allPlayersFiltered.length === 0 && !playersLoading && <p className="text-center text-slate-500 text-sm py-4">No players found</p>}
            </div>
          </div>
        )}

        {/* DRAFT */}
        {!detailLoading && activeTab === 'draft' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {isSleeperLeague && sleeperLeagueInfo ? <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3"><p className="text-xs text-sky-600 dark:text-sky-300">Draft data is managed by Sleeper. Draft results will appear once the draft is complete.</p></div> : (<>
              {draftPicks.length > 0 && <div><p className="text-xs font-semibold text-slate-400 uppercase mb-2">Recent Picks</p><div className="space-y-1">{draftPicks.slice(-10).reverse().map(pick => { const member = members.find(m => m.id === pick.member_id); return <div key={pick.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-white/5"><span className="text-xs text-slate-400 w-8 font-mono">#{pick.pick_number}</span><div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pick.player?.name}</p><p className="text-xs text-slate-500">{pick.player?.position} · {pick.player?.team} · {member?.team_name ?? 'Unknown'}</p></div><span className="text-xs font-semibold text-sky-500">{(pick.player?.projected_points ?? 0).toFixed(1)}</span></div>; })}</div></div>}
              {league.draft_status === 'drafting' && isMyTurn && <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Available Players</p><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Search players..." className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>{playersLoading && <div className="flex justify-center py-4"><BubbleLoader size={20} /></div>}<div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">{filteredPlayers.map(p => <button key={p.player_id} onClick={() => draftPlayer(p)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5 hover:bg-sky-500/10 transition-all text-left border border-transparent hover:border-sky-500/20"><div className="flex-1"><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team}{p.injury_status ? ` · ${p.injury_status}` : ''}</p></div><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)} pts</span><ChevronRight size={14} className="text-sky-500" /></button>)}</div></div>}
              {league.draft_status === 'not_started' && <div className="text-center py-8"><Clock size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-500">{league.draft_time ? `Draft starts ${new Date(league.draft_time).toLocaleString()}` : 'No draft time set'}</p>{isOwner && <button onClick={startDraft} className="mt-3 text-xs font-medium text-sky-500 hover:text-sky-400 px-3 py-1.5 rounded-lg bg-sky-500/10">Start Draft Now</button>}</div>}
              {draftPicks.length > 0 && <div><p className="text-xs font-semibold text-slate-400 uppercase mb-2 mt-4">All Teams</p><div className="space-y-2">{members.sort((a, b) => a.draft_position - b.draft_position).map(m => { const teamRoster = rosters.filter(r => r.member_id === m.id); const isMe = m.user_id === user?.id; return <div key={m.id} className={`rounded-lg p-2.5 ${isMyTurn && isMe ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-white dark:bg-white/5'}`}><div className="flex items-center gap-2 mb-1"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isMe ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500'}`}>{m.draft_position}</span><span className="text-xs font-medium text-slate-900 dark:text-white">{m.team_name}</span></div><div className="flex flex-wrap gap-1 ml-7">{teamRoster.length === 0 ? <span className="text-xs text-slate-400">No picks yet</span> : teamRoster.map(r => <span key={r.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">{r.player?.name} ({r.player?.position})</span>)}</div></div>; })}</div></div>}
            </>)}
          </div>
        )}

        {/* WAIVER */}
        {!detailLoading && activeTab === 'waiver' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1"><TrendingUp size={12} /> Trending {trendingType === 'add' ? 'Adds' : 'Drops'}</p><div className="flex gap-1"><button onClick={() => loadTrending('add')} className={`text-xs px-2 py-1 rounded ${trendingType === 'add' ? 'bg-emerald-500/20 text-emerald-500' : 'text-slate-400'}`}>Adds</button><button onClick={() => loadTrending('drop')} className={`text-xs px-2 py-1 rounded ${trendingType === 'drop' ? 'bg-red-500/20 text-red-500' : 'text-slate-400'}`}>Drops</button></div></div>
              {trending.length === 0 ? <p className="text-center text-slate-500 text-xs py-2">Loading trending players...</p> : <div className="space-y-1">{trending.slice(0, 15).map(p => <button key={p.player_id} onClick={() => setSelectedPlayer(p)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-left transition-all"><span className="text-xs font-medium text-slate-900 dark:text-white flex-1">{p.name}</span><span className="text-xs text-slate-500">{p.position} · {p.team}</span><span className="text-xs text-slate-400">{p.count ?? 0}</span></button>)}</div>}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase">Available Players</p>
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={waiverSearch} onChange={e => setWaiverSearch(e.target.value)} placeholder="Search available players..." className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30" /></div>
              <div className="space-y-1">{waiverPlayers.map(p => <div key={p.player_id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"><button onClick={() => setSelectedPlayer(p)} className="flex-1 flex items-center gap-3 text-left"><div><p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p><p className="text-xs text-slate-500">{p.position} · {p.team}{p.injury_status && <span className={injuryColor(p.injury_status)}> · {p.injury_status}</span>}</p></div></button><span className="text-xs font-semibold text-sky-500">{(p.projected_points ?? 0).toFixed(1)}</span>{!isSleeperLeague && myMember && <button onClick={() => addPlayer(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 transition-all opacity-0 group-hover:opacity-100" title="Add player"><Plus size={14} /></button>}</div>)}{waiverPlayers.length === 0 && <p className="text-center text-slate-500 text-sm py-4">{players.length === 0 ? 'Loading players...' : 'No players found'}</p>}</div>
            </div>
          </div>
        )}

        {/* TRADES */}
        {!detailLoading && activeTab === 'trades' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {myMember && members.filter(m => m.user_id !== user?.id).length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Propose a Trade</p>{!tradeTarget ? <div className="space-y-1">{members.filter(m => m.user_id !== user?.id).map(m => <button key={m.id} onClick={() => { setTradeTarget(m); setOfferedPlayerIds([]); setRequestedPlayerIds([]); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-left"><ArrowRightLeft size={14} className="text-sky-500" /><span className="text-sm text-slate-900 dark:text-white">{m.team_name}</span></button>)}</div> : <div className="space-y-3 bg-sky-500/5 border border-sky-500/10 rounded-xl p-3"><div className="flex items-center justify-between"><p className="text-xs font-medium text-sky-500">Trading with {tradeTarget.team_name}</p><button onClick={() => setTradeTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button></div><div><p className="text-xs text-slate-500 mb-1">You offer:</p><div className="space-y-1">{myRoster.map(r => { const pid = r.player?.player_id ?? r.player_id; const isSelected = offeredPlayerIds.includes(pid); return <button key={r.id} onClick={() => setOfferedPlayerIds(prev => isSelected ? prev.filter(id => id !== pid) : [...prev, pid])} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${isSelected ? 'bg-sky-500/20' : 'bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'}`}><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{r.player?.name}</span><span className="text-slate-400">{r.player?.position}</span>{isSelected && <Check size={12} className="text-sky-500" />}</button>; })}</div></div><div><p className="text-xs text-slate-500 mb-1">You want:</p><div className="space-y-1">{rosters.filter(r => r.member_id === tradeTarget.id).map(r => { const pid = r.player?.player_id ?? r.player_id; const isSelected = requestedPlayerIds.includes(pid); return <button key={r.id} onClick={() => setRequestedPlayerIds(prev => isSelected ? prev.filter(id => id !== pid) : [...prev, pid])} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs ${isSelected ? 'bg-sky-500/20' : 'bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10'}`}><span className="flex-1 text-left text-slate-700 dark:text-slate-200">{r.player?.name}</span><span className="text-slate-400">{r.player?.position}</span>{isSelected && <Check size={12} className="text-sky-500" />}</button>; })}{rosters.filter(r => r.member_id === tradeTarget.id).length === 0 && <p className="text-xs text-slate-400 px-2 py-1">No players on this team</p>}</div></div><button onClick={proposeTrade} disabled={offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0} className="w-full py-2 bg-sky-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">Send Trade Offer</button></div>}</div>}
            {trades.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-slate-400 uppercase">Trade History</p>{trades.map(t => { const proposer = members.find(m => m.id === t.proposer_member_id); const target = members.find(m => m.id === t.target_member_id); const isTarget = t.target_member_id === myMember?.id && t.status === 'pending'; return <div key={t.id} className="bg-white dark:bg-white/5 rounded-lg p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{proposer?.team_name ?? 'Unknown'} → {target?.team_name ?? 'Unknown'}</span><span className={`text-xs font-medium ${t.status === 'pending' ? 'text-sky-500' : t.status === 'accepted' ? 'text-emerald-500' : 'text-red-500'}`}>{t.status}</span></div><div className="flex items-center gap-2 text-xs text-slate-500"><div className="flex-1"><p className="font-medium">Offers:</p>{t.offered_player_ids.map(pid => { const p = playerMap[pid] ?? players.find(pl => pl.player_id === pid); return <p key={pid}>{p?.name ?? pid}</p>; })}</div><ArrowRightLeft size={14} className="text-slate-400" /><div className="flex-1"><p className="font-medium">Wants:</p>{t.requested_player_ids.map(pid => { const p = playerMap[pid] ?? players.find(pl => pl.player_id === pid); return <p key={pid}>{p?.name ?? pid}</p>; })}</div></div>{isTarget && <div className="flex gap-2 pt-1"><button onClick={() => respondToTrade(t, true)} className="flex-1 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">Accept</button><button onClick={() => respondToTrade(t, false)} className="flex-1 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium">Reject</button></div>}</div>; })}</div>}
            {trades.length === 0 && !tradeTarget && <p className="text-center text-slate-500 text-sm py-4">No trades yet. Propose one above!</p>}
          </div>
        )}

        {/* SCHEDULE */}
        {!detailLoading && activeTab === 'schedule' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {isSleeperLeague && sleeperLeagueInfo ? (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setScheduleWeek(w => Math.max(1, w - 1))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 transition-all"><ChevronLeft size={16} /></button>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white flex-1 text-center">Week {scheduleWeek}</span>
                  <button onClick={() => setScheduleWeek(w => Math.min(18, w + 1))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 transition-all"><ChevronRight size={16} /></button>
                </div>
                {(() => {
                  const weekMatchups = sleeperMatchups.filter(m => true);
                  const pairs: { home: SleeperMatchup; away: SleeperMatchup; homeUser?: SleeperUser; awayUser?: SleeperUser }[] = [];
                  const mmap: Record<number, SleeperMatchup[]> = {};
                  weekMatchups.forEach(m => { (mmap[m.matchup_id] ??= []).push(m); });
                  Object.entries(mmap).forEach(([_, pair]) => {
                    if (pair.length === 2) {
                      const homeUser = sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === pair[0].roster_id)?.owner_id === u.user_id);
                      const awayUser = sleeperUsers.find(u => sleeperRosters.find(r => r.roster_id === pair[1].roster_id)?.owner_id === u.user_id);
                      pairs.push({ home: pair[0], away: pair[1], homeUser, awayUser });
                    }
                  });
                  if (pairs.length === 0) return <p className="text-center text-slate-500 text-sm py-4">No matchups for this week</p>;
                  return pairs.map((pair, i) => {
                    const homePts = pair.home.points ?? 0;
                    const awayPts = pair.away.points ?? 0;
                    const homeWin = homePts > awayPts;
                    const isMine = pair.home.roster_id === mySleeperRoster?.roster_id || pair.away.roster_id === mySleeperRoster?.roster_id;
                    return (
                      <div key={i} className={`rounded-xl p-3 ${isMine ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-white dark:bg-white/5'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 text-left">
                            <p className={`text-sm font-medium ${homeWin ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>{pair.homeUser?.display_name ?? 'Unknown'}</p>
                            <p className="text-xs text-slate-500">{sleeperRosters.find(r => r.roster_id === pair.home.roster_id)?.settings.wins ?? 0}-{sleeperRosters.find(r => r.roster_id === pair.home.roster_id)?.settings.losses ?? 0}</p>
                          </div>
                          <div className="text-center px-3">
                            <p className={`text-lg font-bold ${homeWin ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'}`}>{homePts.toFixed(2)}</p>
                            <p className="text-[10px] text-slate-400">vs</p>
                            <p className={`text-lg font-bold ${!homeWin ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'}`}>{awayPts.toFixed(2)}</p>
                          </div>
                          <div className="flex-1 text-right">
                            <p className={`text-sm font-medium ${!homeWin ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>{pair.awayUser?.display_name ?? 'Unknown'}</p>
                            <p className="text-xs text-slate-500">{sleeperRosters.find(r => r.roster_id === pair.away.roster_id)?.settings.wins ?? 0}-{sleeperRosters.find(r => r.roster_id === pair.away.roster_id)?.settings.losses ?? 0}</p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                <p className="text-xs text-slate-400 text-center pt-2">Regular season: Weeks 1-14 · Playoffs: 15-17</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setScheduleWeek(w => Math.max(1, w - 1))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 transition-all"><ChevronLeft size={16} /></button>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white flex-1 text-center">Week {scheduleWeek}</span>
                  <button onClick={() => setScheduleWeek(w => Math.min(league?.num_teams ? Math.ceil(league.num_teams / 2) * 14 : 14, w + 1))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 transition-all"><ChevronRight size={16} /></button>
                </div>
                {(() => {
                  const numTeams = league?.num_teams ?? 10;
                  const half = Math.ceil(numTeams / 2);
                  const matchups: { home: FFMember; away: FFMember }[] = [];
                  const sorted = [...members].sort((a, b) => a.draft_position - b.draft_position);
                  for (let i = 0; i < half; i++) {
                    const homeIdx = ((scheduleWeek - 1) * 2 + i * 2) % numTeams;
                    const awayIdx = ((scheduleWeek - 1) * 2 + i * 2 + 1) % numTeams;
                    if (sorted[homeIdx] && sorted[awayIdx]) {
                      matchups.push({ home: sorted[homeIdx], away: sorted[awayIdx] });
                    }
                  }
                  if (matchups.length === 0) return <p className="text-center text-slate-500 text-sm py-4">No matchups scheduled</p>;
                  return matchups.map((m, i) => {
                    const isMine = m.home.user_id === user?.id || m.away.user_id === user?.id;
                    const homeRecord = `${m.home.wins}-${m.home.losses}${m.home.ties ? `-${m.home.ties}` : ''}`;
                    const awayRecord = `${m.away.wins}-${m.away.losses}${m.away.ties ? `-${m.away.ties}` : ''}`;
                    return (
                      <div key={i} className={`rounded-xl p-3 ${isMine ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-white dark:bg-white/5'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{m.home.team_name}</p>
                            <p className="text-xs text-slate-500">{homeRecord}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 px-3">vs</span>
                          <div className="flex-1 text-right">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{m.away.team_name}</p>
                            <p className="text-xs text-slate-500">{awayRecord}</p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                <p className="text-xs text-slate-400 text-center pt-2">Schedule rotates weekly based on draft position</p>
              </>
            )}
          </div>
        )}

        {/* CHAT */}
        {!detailLoading && activeTab === 'chat' && (
          <div className="flex flex-col h-full max-w-2xl mx-auto" style={{ minHeight: 'calc(100% - 20px)' }}>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pb-2">
              {chatMsgs.length === 0 && <p className="text-center text-slate-500 text-sm py-8">No messages yet. Start chatting!</p>}
              {chatMsgs.map(msg => { const sender = members.find(m => m.user_id === msg.sender_id); const isMe = msg.sender_id === user?.id; const isSystem = msg.message_type === 'system' || msg.message_type === 'draft_pick'; if (isSystem) return <div key={msg.id} className="text-center py-1"><span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/5 rounded-full px-3 py-1">{msg.content}</span></div>; return <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isMe ? 'bg-sky-500 text-white' : 'bg-white dark:bg-white/5 text-slate-900 dark:text-white'}`}>{!isMe && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{sender?.team_name ?? 'Unknown'}</p>}<p className="text-sm">{msg.content}</p></div></div>; })}
            </div>
            <div className="flex gap-2 sticky bottom-0 bg-slate-50 dark:bg-slate-950 pt-2 pb-1">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder="Type a message..." className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500/30" />
              <button onClick={sendChat} disabled={sending || !chatInput.trim()} className="px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium disabled:opacity-40">Send</button>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {!detailLoading && activeTab === 'settings' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {!isOwner ? <p className="text-center text-slate-500 text-sm py-4">Only the league owner can change settings</p> : (<>
              <p className="text-xs font-semibold text-slate-400 uppercase">League Settings</p>
              <SettingRow label="Scoring: Pass TD" value={league.pass_td_pts} onChange={v => updateLeagueSettings({ pass_td_pts: v })} />
              <SettingRow label="Scoring: Pass YD (per)" value={league.pass_yd_pts} onChange={v => updateLeagueSettings({ pass_yd_pts: v })} />
              <SettingRow label="Scoring: INT" value={league.int_pts} onChange={v => updateLeagueSettings({ int_pts: v })} />
              <SettingRow label="Scoring: Rush TD" value={league.rush_td_pts} onChange={v => updateLeagueSettings({ rush_td_pts: v })} />
              <SettingRow label="Scoring: Rush YD (per)" value={league.rush_yd_pts} onChange={v => updateLeagueSettings({ rush_yd_pts: v })} />
              <SettingRow label="Scoring: Rec TD" value={league.rec_td_pts} onChange={v => updateLeagueSettings({ rec_td_pts: v })} />
              <SettingRow label="Scoring: Rec YD (per)" value={league.rec_yd_pts} onChange={v => updateLeagueSettings({ rec_yd_pts: v })} />
              <SettingRow label="Scoring: Per Reception (PPR)" value={league.rec_pts} onChange={v => updateLeagueSettings({ rec_pts: v })} />
              <SettingRow label="Scoring: Fumble" value={league.fumble_pts} onChange={v => updateLeagueSettings({ fumble_pts: v })} />
              <SettingRow label="Scoring: FG 0-39" value={league.fg_0_39} onChange={v => updateLeagueSettings({ fg_0_39: v })} />
              <SettingRow label="Scoring: FG 40-49" value={league.fg_40_49} onChange={v => updateLeagueSettings({ fg_40_49: v })} />
              <SettingRow label="Scoring: FG 50+" value={league.fg_50_plus} onChange={v => updateLeagueSettings({ fg_50_plus: v })} />
              <SettingRow label="Scoring: XP" value={league.xp_pts} onChange={v => updateLeagueSettings({ xp_pts: v })} />
              <SettingRow label="Roster: QB" value={league.qb_count} onChange={v => updateLeagueSettings({ qb_count: v })} />
              <SettingRow label="Roster: RB" value={league.rb_count} onChange={v => updateLeagueSettings({ rb_count: v })} />
              <SettingRow label="Roster: WR" value={league.wr_count} onChange={v => updateLeagueSettings({ wr_count: v })} />
              <SettingRow label="Roster: TE" value={league.te_count} onChange={v => updateLeagueSettings({ te_count: v })} />
              <SettingRow label="Roster: K" value={league.k_count} onChange={v => updateLeagueSettings({ k_count: v })} />
              <SettingRow label="Roster: DEF" value={league.def_count} onChange={v => updateLeagueSettings({ def_count: v })} />
              <SettingRow label="Roster: FLEX" value={league.flex_count} onChange={v => updateLeagueSettings({ flex_count: v })} />
              <SettingRow label="Roster: Bench" value={league.bench_count} onChange={v => updateLeagueSettings({ bench_count: v })} />
            </>)}
          </div>
        )}
      </div>
      {error && <div className="flex-shrink-0 px-4 py-2 bg-red-500/10 text-red-500 text-xs text-center">{error}</div>}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="bg-white dark:bg-white/5 rounded-lg px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-medium text-slate-900 dark:text-white">{value}</p></div>;
}

function SettingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div className="flex items-center justify-between bg-white dark:bg-white/5 rounded-lg px-3 py-2"><span className="text-xs text-slate-600 dark:text-slate-300">{label}</span><input type="number" step="0.1" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="w-16 bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:ring-1 focus:ring-sky-500/30" /></div>;
}
