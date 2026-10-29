import { Profile, effectiveStatus } from '../lib/supabase';

type AvatarProps = {
  profile?: Profile | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
};

const sizeMap = {
  xs: { outer: 'w-6 h-6', text: 'text-xs', dot: 'w-2 h-2 border-[1.5px]', dotPos: '-bottom-0.5 -right-0.5' },
  sm: { outer: 'w-8 h-8', text: 'text-xs', dot: 'w-2.5 h-2.5 border-2', dotPos: '-bottom-0.5 -right-0.5' },
  md: { outer: 'w-10 h-10', text: 'text-sm', dot: 'w-3 h-3 border-2', dotPos: '-bottom-0.5 -right-0.5' },
  lg: { outer: 'w-12 h-12', text: 'text-base', dot: 'w-3.5 h-3.5 border-2', dotPos: 'bottom-0 right-0' },
  xl: { outer: 'w-16 h-16', text: 'text-xl', dot: 'w-4 h-4 border-2', dotPos: 'bottom-0.5 right-0.5' },
};

const statusColors = {
  online: 'bg-green-400',
  away: 'bg-yellow-400',
  busy: 'bg-red-400',
  offline: 'bg-slate-500',
};

export default function Avatar({ profile, size = 'md', showStatus = false, className = '' }: AvatarProps) {
  const s = sizeMap[size];
  const initials = profile?.display_name
    ? profile.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  
  const colors = [
    'from-sky-500 to-blue-600',
    'from-violet-500 to-purple-600',
    'from-pink-500 to-rose-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-cyan-500 to-blue-500',
  ];
  const colorIndex = profile?.display_name
    ? profile.display_name.charCodeAt(0) % colors.length
    : 0;

  return (
    <div className={`relative flex-shrink-0 ${s.outer} ${className}`}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          className={`${s.outer} rounded-full object-cover`}
        />
      ) : (
        <div className={`${s.outer} rounded-full bg-gradient-to-br ${colors[colorIndex]} flex items-center justify-center`}>
          <span className={`${s.text} font-bold text-white`}>{initials}</span>
        </div>
      )}
      {showStatus && profile && (
        <div
          className={`absolute ${s.dotPos} ${s.dot} rounded-full border-slate-800 transition-colors duration-1000`}
          style={{ backgroundColor: { online: '#4ade80', away: '#facc15', busy: '#f87171', offline: '#64748b' }[effectiveStatus(profile)] }}
        />
      )}
    </div>
  );
}
