import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart2, Check } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  pollId: string;
  userId: string;
};

type Poll = {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string[]>; // optionIndex -> userIds
  allows_multiple: boolean;
  max_choices: number | null;
  ends_at: string | null;
  creator_id: string;
};

export default function PollMessage({ pollId, userId }: Props) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    loadPoll();
    const channel = supabase
      .channel(`poll_${pollId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, (p) => {
        setPoll(prev => prev ? { ...prev, ...p.new, options: p.new.options ?? prev.options, votes: p.new.votes ?? prev.votes } : null);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pollId]);

  async function loadPoll() {
    const { data } = await supabase.from('polls').select('*').eq('id', pollId).maybeSingle();
    if (data) setPoll(data as Poll);
    setLoading(false);
  }

  async function vote(optionIndex: number) {
    if (!poll || voting) return;
    setVoting(true);
    const votes = { ...poll.votes };
    const key = String(optionIndex);
    const userIdStr = String(userId);
    const maxChoices = poll.max_choices ?? 1;

    // Count how many options this user has already voted for
    let userVoteCount = 0;
    Object.keys(votes).forEach(k => {
      if ((votes[k] ?? []).includes(userIdStr)) userVoteCount++;
    });

    const current = votes[key] ?? [];
    const hasVoted = current.includes(userIdStr);

    if (hasVoted) {
      // Toggle off this vote
      votes[key] = current.filter(u => u !== userIdStr);
      if (votes[key].length === 0) delete votes[key];
    } else {
      if (poll.allows_multiple) {
        // Enforce max choices: remove oldest votes if at limit
        if (userVoteCount >= maxChoices) {
          // Find and remove the user's vote from the option they voted on earliest
          // Simplest: remove from the first option they've voted on
          for (const k of Object.keys(votes)) {
            const arr = votes[k] ?? [];
            if (arr.includes(userIdStr)) {
              votes[k] = arr.filter(u => u !== userIdStr);
              if (votes[k].length === 0) delete votes[k];
              break;
            }
          }
        }
        votes[key] = [...(votes[key] ?? []), userIdStr];
      } else {
        // Single choice: remove from all other options first
        Object.keys(votes).forEach(k => {
          if (k !== key) {
            votes[k] = (votes[k] ?? []).filter(u => u !== userIdStr);
            if (votes[k].length === 0) delete votes[k];
          }
        });
        votes[key] = [...(votes[key] ?? []), userIdStr];
      }
    }

    await supabase.from('polls').update({ votes }).eq('id', pollId);
    setPoll(prev => prev ? { ...prev, votes } : null);
    setVoting(false);
  }

  if (loading) return <div className="my-2"><BubbleLoader size={28} /></div>;
  if (!poll) return null;

  const totalVotes = Object.values(poll.votes).reduce((sum, users) => sum + users.length, 0);

  return (
    <div className="p-3 min-w-[220px] space-y-3">
      <div className="flex items-start gap-2">
        <BarChart2 size={15} className="text-orange-400 flex-shrink-0 mt-0.5" />
        <p className="text-white font-semibold text-[13px] leading-snug">{poll.question}</p>
      </div>

      <div className="space-y-2">
        {poll.options.map((option, i) => {
          const voters = poll.votes[String(i)] ?? [];
          const hasVoted = voters.includes(userId);
          const count = voters.length;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={voting}
              className={`w-full relative text-left rounded-xl overflow-hidden transition-all ${
                hasVoted ? 'ring-2 ring-white/40' : 'hover:ring-1 hover:ring-white/20'
              }`}
            >
              <div className="absolute inset-0 rounded-xl bg-white/10" />
              <div
                className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-500 ${hasVoted ? 'bg-white/30' : 'bg-white/15'}`}
                style={{ width: `${pct}%` }}
              />
              <div className="relative px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {hasVoted && <Check size={11} className="text-white flex-shrink-0" />}
                  <span className="text-white text-[12px] font-medium">{option}</span>
                </div>
                <span className="text-white/60 text-[11px] flex-shrink-0">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-white/50 text-[10px] text-right">
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        {poll.allows_multiple && poll.max_choices && poll.max_choices > 1 && ` · max ${poll.max_choices} per voter`}
      </p>
    </div>
  );
}
