import { Trophy, Medal, Award, TrendingUp } from 'lucide-react';
import GlassCard from '../components/GlassCard';

const AGENTS = [
  { rank: 1, name: 'Sarah Kim', role: 'Claims Adjuster', score: 87, sessions: 24, trend: '+5', avatar: 'SK' },
  { rank: 2, name: 'James Chen', role: 'Senior Adjuster', score: 84, sessions: 31, trend: '+3', avatar: 'JC' },
  { rank: 3, name: 'Maria Garcia', role: 'Claims Adjuster', score: 81, sessions: 18, trend: '+7', avatar: 'MG' },
  { rank: 4, name: 'David Park', role: 'New Hire', score: 76, sessions: 12, trend: '+12', avatar: 'DP' },
  { rank: 5, name: 'Emily Watson', role: 'Claims Adjuster', score: 73, sessions: 15, trend: '+2', avatar: 'EW' },
  { rank: 6, name: 'Alex Johnson', role: 'New Hire', score: 68, sessions: 8, trend: '+9', avatar: 'AJ' },
];

const RANK_STYLES = {
  1: { icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  2: { icon: Medal, color: 'text-gray-300', bg: 'bg-gray-300/10' },
  3: { icon: Award, color: 'text-amber-600', bg: 'bg-amber-600/10' },
};

export default function Leaderboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">Leaderboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          See how your team is performing across training scenarios
        </p>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-3 gap-4">
        {AGENTS.slice(0, 3).map((agent) => {
          const rankInfo = RANK_STYLES[agent.rank];
          const RankIcon = rankInfo.icon;
          return (
            <GlassCard key={agent.rank} className={`p-6 text-center ${agent.rank === 1 ? 'border-amber-400/20' : ''}`}>
              <div className={`w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center ${rankInfo.bg}`}>
                <RankIcon size={20} className={rankInfo.color} />
              </div>
              <div className="w-12 h-12 rounded-full bg-[#464e7e] flex items-center justify-center text-white text-sm font-semibold mx-auto mb-2">
                {agent.avatar}
              </div>
              <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
              <p className="text-[11px] text-gray-500 mb-3">{agent.role}</p>
              <p className="text-2xl font-bold text-[#464e7e]">{agent.score}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Avg Score</p>
            </GlassCard>
          );
        })}
      </div>

      {/* Full Table */}
      <GlassCard hover={false} className="overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">All Agents</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {AGENTS.map((agent) => (
            <div key={agent.rank} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <span className="w-8 text-center text-sm font-semibold text-gray-500">#{agent.rank}</span>
              <div className="w-9 h-9 rounded-full bg-[#464e7e] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {agent.avatar}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{agent.name}</p>
                <p className="text-xs text-gray-500">{agent.role}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#464e7e]">{agent.score}</p>
                <p className="text-[11px] text-gray-500">{agent.sessions} sessions</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-green-400 font-medium w-12">
                <TrendingUp size={12} /> {agent.trend}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
