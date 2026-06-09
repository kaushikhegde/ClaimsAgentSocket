import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Heart, Ear, Bone, Shuffle, Zap } from 'lucide-react';
import GlassCard from '../components/GlassCard';

const SESSIONS = [
  {
    id: 'session-1',
    name: 'Chest Injury',
    scenario: 'Chest Injury',
    mode: 'Scripted',
    duration: '2m 47s',
    empathy: 94,
    compliance: 96,
    score: 87,
    rating: 'excellent',
    date: 'Apr 3',
  },
  {
    id: 'session-2',
    name: 'Hearing Loss',
    scenario: 'Hearing Loss',
    mode: 'Scripted',
    duration: '2m 32s',
    empathy: 88,
    compliance: 91,
    score: 82,
    rating: 'good',
    date: 'Apr 2',
  },
  {
    id: 'session-3',
    name: 'Physical Injury',
    scenario: 'Physical Injury',
    mode: 'Freestyle',
    duration: '2m 58s',
    empathy: 76,
    compliance: 88,
    score: 74,
    rating: 'average',
    date: 'Apr 1',
  },
  {
    id: 'session-4',
    name: 'Chest Injury',
    scenario: 'Chest Injury',
    mode: 'Scripted',
    duration: '2m 51s',
    empathy: 82,
    compliance: 90,
    score: 79,
    rating: 'good',
    date: 'Mar 30',
  },
  {
    id: 'session-5',
    name: 'Freestyle',
    scenario: 'Freestyle',
    mode: 'Random',
    duration: '1m 45s',
    empathy: 71,
    compliance: 82,
    score: 65,
    rating: 'poor',
    date: 'Mar 28',
  },
  {
    id: 'session-6',
    name: 'Hearing Loss',
    scenario: 'Hearing Loss',
    mode: 'Scripted',
    duration: '2m 12s',
    empathy: 68,
    compliance: 85,
    score: 62,
    rating: 'poor',
    date: 'Mar 26',
  },
];

const FILTERS = ['All Sessions', 'Chest Injury', 'Hearing Loss', 'Physical Injury', 'Freestyle'];

const SCORE_STYLES = {
  excellent: 'text-green-400 bg-green-400/[0.12]',
  good: 'text-[#464e7e] bg-[#eef0f6]',
  average: 'text-amber-400 bg-amber-400/[0.12]',
  poor: 'text-red-400 bg-red-400/[0.12]',
};

const SCENARIO_ICON = {
  'Chest Injury': { icon: Heart, bg: 'bg-red-400/[0.12]', color: 'text-red-400' },
  'Hearing Loss': { icon: Ear, bg: 'bg-purple-400/[0.12]', color: 'text-purple-400' },
  'Physical Injury': { icon: Bone, bg: 'bg-amber-400/[0.12]', color: 'text-amber-400' },
  Freestyle: { icon: Shuffle, bg: 'bg-[#eef0f6]', color: 'text-[#464e7e]' },
};

const DEFAULT_ICON = { icon: Zap, bg: 'bg-[#eef0f6]', color: 'text-[#464e7e]' };

export default function Sessions() {
  const [activeFilter, setActiveFilter] = useState('All Sessions');
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/sessions?limit=50')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data.map(s => ({
            id: s.id,
            name: s.scenario_name || s.scenario_id || 'Session',
            scenario: s.scenario_name || s.scenario_id || 'Unknown',
            mode: s.scenario_mode === 'scripted' ? 'Scripted' : 'Freestyle',
            duration: s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : '\u2014',
            empathy: s.scores?.empathy || 0,
            compliance: s.scores?.compliance || 0,
            score: s.overall_score || 0,
            rating: s.overall_score >= 85 ? 'excellent' : s.overall_score >= 75 ? 'good' : s.overall_score >= 65 ? 'average' : 'poor',
            date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })));
        }
      })
      .catch(() => setSessions(null));
  }, []);

  const displaySessions = sessions ?? SESSIONS;

  const filtered = displaySessions.filter((s) => {
    const matchFilter = activeFilter === 'All Sessions' || s.scenario === activeFilter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">Session History</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review past training sessions and track your progress
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                activeFilter === f
                  ? 'bg-[rgba(70,78,126,0.1)] border border-[rgba(70,78,126,0.25)] text-[#464e7e] font-semibold'
                  : 'bg-gray-50 border border-gray-200 text-gray-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 pl-9 text-sm text-gray-900 placeholder-gray-500 focus:border-[#464e7e]/50 focus:ring-2 focus:ring-[#464e7e]/10 focus:outline-none transition-all w-56"
          />
        </div>
      </div>

      {/* Session Rows */}
      <div className="space-y-2">
        {filtered.map((session) => {
          const iconInfo = SCENARIO_ICON[session.scenario] || DEFAULT_ICON;
          const IconComp = iconInfo.icon;

          return (
            <GlassCard
              key={session.id}
              className="flex items-center gap-4 p-4 cursor-pointer"
              onClick={() => navigate(`/sessions/${session.id}`)}
            >
              {/* Icon */}
              <div
                className={`w-[44px] h-[44px] rounded-xl flex items-center justify-center shrink-0 ${iconInfo.bg}`}
              >
                <IconComp className={`w-5 h-5 ${iconInfo.color}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{session.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {session.mode} &middot; {session.duration} &middot; Empathy {session.empathy} &middot; Compliance {session.compliance}
                </p>
              </div>

              {/* Score Pill */}
              <div
                className={`min-w-[40px] text-center px-2.5 py-1 rounded-lg text-xs font-semibold ${SCORE_STYLES[session.rating]}`}
              >
                {session.score}
              </div>

              {/* Date */}
              <div className="w-[80px] text-right text-xs text-gray-400 shrink-0">
                {session.date}
              </div>

              {/* View Link */}
              <span className="text-xs text-[#464e7e] font-medium shrink-0">View &rarr;</span>
            </GlassCard>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-gray-500">
              {sessions !== null && sessions.length === 0
                ? 'No training sessions yet'
                : 'No sessions match your filters'}
            </p>
            {sessions !== null && sessions.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Complete a training scenario to see your session history here</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
