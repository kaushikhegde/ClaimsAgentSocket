import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Target,
  HeartHandshake,
  ShieldCheck,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import GlassCard from '../components/GlassCard';

/* ─── Avatar SVGs ────────────────────────────────────────────────── */

const MaleAvatar = () => (
  <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
    <circle cx="40" cy="26" r="14" fill="#d4a574" />
    <path d="M26 22c0-10 6-16 14-16s14 6 14 16" fill="#3d2b1f" />
    <rect x="26" y="18" width="28" height="6" rx="3" fill="#3d2b1f" />
    <circle cx="34" cy="27" r="2" fill="#2d2d2d" />
    <circle cx="46" cy="27" r="2" fill="#2d2d2d" />
    <path d="M36 33c2 2 6 2 8 0" stroke="#b8896a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M16 68c0-13.255 10.745-24 24-24s24 10.745 24 24" fill="#464e7e" />
    <path d="M34 44l6 6 6-6" stroke="#3a4169" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);
const FemaleAvatar = () => (
  <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
    <path d="M22 24c0-12 8-20 18-20s18 8 18 20c0 6-1 14-4 20h-28c-3-6-4-14-4-20z" fill="#5c3317" />
    <circle cx="40" cy="26" r="14" fill="#e8b89d" />
    <path d="M26 22c0-10 6-16 14-16s14 6 14 16" fill="#5c3317" />
    <path d="M26 22c2-2 5-3 8-2" stroke="#5c3317" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M54 22c-2-2-5-3-8-2" stroke="#5c3317" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M24 26c-1 6 0 14 2 18" stroke="#5c3317" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M56 26c1 6 0 14-2 18" stroke="#5c3317" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="34" cy="27" r="2" fill="#2d2d2d" />
    <circle cx="46" cy="27" r="2" fill="#2d2d2d" />
    <path d="M32 25l-1-1.5M34 24.5v-1.5M36 25l1-1.5" stroke="#2d2d2d" strokeWidth="0.8" strokeLinecap="round" />
    <path d="M44 25l-1-1.5M46 24.5v-1.5M48 25l1-1.5" stroke="#2d2d2d" strokeWidth="0.8" strokeLinecap="round" />
    <path d="M36 33c2 2.5 6 2.5 8 0" stroke="#c47a6a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M16 68c0-13.255 10.745-24 24-24s24 10.745 24 24" fill="#6b5b95" />
    <path d="M34 44c3 4 9 4 12 0" stroke="#5a4d80" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

/* ─── Scenarios (static — these are the training scenarios, not session data) ── */

const SCENARIOS = [
  {
    id: 'chest-injury',
    title: 'Chest Injury Claim',
    desc: 'Practice handling a sensitive chest injury workers\u2019 compensation claim with empathy and compliance.',
    personas: [
      { name: 'Marcus Johnson', gender: 'male' },
      { name: 'Sarah Mitchell', gender: 'female' },
      { name: 'David Nguyen', gender: 'male' },
    ],
    iconBg: 'bg-[#464e7e]/[0.1]',
    difficulty: 'Beginner',
    diffColor: 'bg-green-400/10 text-green-400',
    time: '~3 min',
  },
  {
    id: 'hearing-loss',
    title: 'Noise-Induced Hearing Loss',
    desc: 'Navigate a complex hearing loss claim requiring detailed information gathering and sensitivity.',
    personas: [
      { name: 'Linda Torres', gender: 'female' },
      { name: 'James Kowalski', gender: 'male' },
      { name: 'Priya Desai', gender: 'female' },
    ],
    iconBg: 'bg-purple-500/[0.12]',
    difficulty: 'Intermediate',
    diffColor: 'bg-amber-400/10 text-amber-400',
    time: '~3 min',
  },
  {
    id: 'physical-injury',
    title: 'Physical Injury',
    desc: 'Handle a standard physical injury claim while maintaining compliance and gathering key details.',
    personas: [
      { name: 'Robert Williams', gender: 'male' },
      { name: 'Elena Vasquez', gender: 'female' },
      { name: 'Tyrone Jacobs', gender: 'male' },
    ],
    iconBg: 'bg-amber-500/[0.12]',
    difficulty: 'Advanced',
    diffColor: 'bg-red-400/10 text-red-400',
    time: '~3 min',
  },
];

const SKILL_META = [
  { key: 'avg_empathy', label: 'Empathy', gradient: 'from-purple-500 to-purple-400' },
  { key: 'avg_compliance', label: 'Compliance', gradient: 'from-amber-500 to-amber-400' },
  { key: 'avg_info_gathering', label: 'Info Gathering', gradient: 'from-blue-500 to-blue-400' },
  { key: 'avg_question_quality', label: 'Question Quality', gradient: 'from-green-500 to-green-400' },
  { key: 'avg_tone', label: 'Tone Consistency', gradient: 'from-teal-500 to-teal-400' },
  { key: 'avg_talk_listen', label: 'Talk/Listen Ratio', gradient: 'from-rose-500 to-rose-400' },
];

/* ─── Helpers ─────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white shadow-lg border border-gray-200 px-3 py-2 text-xs">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className="text-[#464e7e] font-semibold">{payload[0].value}</p>
    </div>
  );
}

function ShimmerBorder() {
  return (
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
  );
}

/* ─── Dashboard ───────────────────────────────────────────────────── */

export default function Dashboard() {
  const navigate = useNavigate();
  const [apiStats, setApiStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setApiStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const s = apiStats?.stats;
  const totalSessions = Number(s?.total_sessions) || 0;
  const avgScore = s?.avg_score ? Math.round(Number(s.avg_score)) : 0;
  const avgEmpathy = s?.avg_empathy ? Math.round(Number(s.avg_empathy)) : 0;
  const avgCompliance = s?.avg_compliance ? Math.round(Number(s.avg_compliance)) : 0;
  const hasData = totalSessions > 0;

  const scoreTrend = apiStats?.history?.length
    ? apiStats.history.map((h) => ({
        name: new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: h.overall_score,
      }))
    : [];

  const skills = SKILL_META.map((sk) => ({
    ...sk,
    value: s?.[sk.key] ? Math.round(Number(s[sk.key])) : 0,
  }));

  const metrics = [
    { label: 'Total Sessions', value: totalSessions, valueColor: 'text-[#464e7e]', icon: TrendingUp },
    { label: 'Average Score', value: hasData ? avgScore : '—', valueColor: 'text-purple-400', icon: Target },
    { label: 'Empathy Rating', value: hasData ? avgEmpathy : '—', valueColor: 'text-green-400', icon: HeartHandshake },
    { label: 'Compliance', value: hasData ? avgCompliance : '—', valueColor: 'text-amber-400', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#464e7e]/[0.06] to-[#464e7e]/[0.03] border border-[#464e7e]/[0.15] p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#464e7e]/[0.1] blur-[80px]" />
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">
          Ready to practice, Sarah?
        </h1>
        <p className="mt-1.5 text-gray-500 text-[15px]">
          {hasData
            ? `You've completed ${totalSessions} session${totalSessions !== 1 ? 's' : ''}. Keep going!`
            : 'Start your first training session to begin tracking your progress.'}
        </p>
        <button
          onClick={() => navigate('/scenarios')}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#464e7e] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#464e7e]/20 transition hover:brightness-110"
        >
          {hasData ? 'Continue Training' : 'Start Training'} <ArrowRight size={15} />
        </button>
      </div>

      {/* ── Metrics Grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <GlassCard key={m.label} className="relative overflow-hidden p-5">
            <ShimmerBorder />
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">
              {m.label}
            </p>
            <p className={`text-[34px] font-bold tracking-tight mt-1 ${m.valueColor}`}>
              {loading ? '…' : m.value}
            </p>
            {hasData && m.label === 'Total Sessions' && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-green-400/10 text-green-400 mt-2">
                {totalSessions} completed
              </span>
            )}
            {!hasData && !loading && (
              <span className="text-[11px] text-gray-400 mt-2 block">
                {m.label === 'Total Sessions' ? 'No sessions yet' : 'Complete a session to track'}
              </span>
            )}
          </GlassCard>
        ))}
      </div>

      {/* ── Score Trend + Skills ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Trend Chart */}
        <GlassCard hover={false} className="p-5">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Score Trend
          </h2>
          {scoreTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={scoreTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f6ef7" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#4f6ef7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#818cf8"
                  strokeWidth={2}
                  fill="url(#scoreGrad)"
                  dot={{ r: 4, fill: '#ffffff', stroke: '#818cf8', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#818cf8', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[220px] text-center">
              <BarChart3 size={32} className="text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No sessions yet</p>
              <p className="text-xs text-gray-400 mt-1">Complete training sessions to see your score trend</p>
            </div>
          )}
        </GlassCard>

        {/* Skills Breakdown */}
        <GlassCard hover={false} className="p-5">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Skills Breakdown
          </h2>
          {hasData ? (
            <div className="space-y-4">
              {skills.map((sk) => (
                <div key={sk.label} className="flex items-center gap-3">
                  <span className="w-[120px] shrink-0 text-sm text-gray-500">{sk.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${sk.gradient} transition-all duration-700`}
                      style={{ width: `${sk.value}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right">{sk.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[220px] text-center">
              <Target size={32} className="text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No skills data yet</p>
              <p className="text-xs text-gray-400 mt-1">Your competency scores will appear here after sessions</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── Training Scenarios ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider">
            Training Scenarios
          </h2>
          <button
            onClick={() => navigate('/scenarios')}
            className="text-xs text-gray-500 hover:text-[#464e7e] transition-colors flex items-center gap-1"
          >
            View All <ArrowRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SCENARIOS.map((s) => {
            const persona = s.personas[Math.floor(Math.random() * s.personas.length)];
            const AvatarIcon = persona.gender === 'female' ? FemaleAvatar : MaleAvatar;
            return (
              <GlassCard key={s.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex items-center justify-center w-[46px] h-[46px] rounded-xl ${s.iconBg}`}>
                    <AvatarIcon />
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.diffColor}`}>
                    {s.difficulty}
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">{s.title}</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed flex-1">{s.desc}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                  <span className="text-xs text-gray-400">{s.time}</span>
                  <button
                    onClick={() => navigate(`/training/${s.id}`)}
                    className="text-xs font-medium text-[#464e7e] hover:text-[#5a6396] transition-colors flex items-center gap-1"
                  >
                    Start <ArrowRight size={12} />
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
