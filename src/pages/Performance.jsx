import { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ── mock data ─────────────────────────────────────────────── */

const trendData = [
  { date: 'Mar 5',  overall: 45, empathy: 35, compliance: 52 },
  { date: 'Mar 12', overall: 58, empathy: 52, compliance: 62 },
  { date: 'Mar 19', overall: 65, empathy: 70, compliance: 68 },
  { date: 'Mar 26', overall: 74, empathy: 80, compliance: 75 },
  { date: 'Apr 1',  overall: 82, empathy: 88, compliance: 85 },
  { date: 'Apr 3',  overall: 87, empathy: 92, compliance: 95 },
];

const competencies = [
  { label: 'Empathy',           score: 92, color: '#c084fc', gradient: 'from-purple-400 to-purple-600' },
  { label: 'Compliance',        score: 95, color: '#fbbf24', gradient: 'from-amber-400 to-amber-600' },
  { label: 'Info Gathering',    score: 84, color: '#818cf8', gradient: 'from-indigo-400 to-indigo-600' },
  { label: 'Question Quality',  score: 78, color: '#4ade80', gradient: 'from-green-400 to-green-600' },
  { label: 'Tone Consistency',  score: 88, color: '#2dd4bf', gradient: 'from-teal-400 to-teal-600' },
  { label: 'Talk/Listen Ratio', score: 72, color: '#fb7185', gradient: 'from-rose-400 to-rose-600' },
];

const strengths = [
  { text: 'Excellent at acknowledging customer emotions',    delta: '+14%' },
  { text: 'Consistently follows compliance checklist',       delta: '+8%'  },
  { text: 'Clear and concise summarization at end of call',  delta: '+11%' },
];

const weaknesses = [
  { text: 'Tends to ask multiple questions at once',              delta: '-12%' },
  { text: 'Talk/listen ratio too high — let customer speak more', delta: '-9%'  },
  { text: 'Missing follow-up on medical provider details',        delta: '-6%'  },
];

const periods = ['7D', '30D', '90D', 'All'];

/* ── custom tooltip ────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg backdrop-blur-md border border-gray-200 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-900 font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="flex items-center gap-2">
          <span className="capitalize">{entry.dataKey}</span>
          <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ── custom legend ─────────────────────────────────────────── */

const legendItems = [
  { key: 'overall',    label: 'Overall',    color: '#818cf8', dashed: false },
  { key: 'empathy',    label: 'Empathy',    color: '#c084fc', dashed: true  },
  { key: 'compliance', label: 'Compliance', color: '#4ade80', dashed: true  },
];

function CustomLegend() {
  return (
    <div className="flex items-center gap-5">
      {legendItems.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <svg width="24" height="2" className="shrink-0">
            <line
              x1="0" y1="1" x2="24" y2="1"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dashed ? '4 3' : undefined}
            />
          </svg>
          <span className="text-[11px] text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────── */

export default function Performance() {
  const [activePeriod, setActivePeriod] = useState('30D');
  const [apiStats, setApiStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats?agent=default')
      .then(r => r.json())
      .then(data => setApiStats(data))
      .catch(() => {});
  }, []);

  const hasData = apiStats?.stats && Number(apiStats.stats.total_sessions) > 0;

  const chartData = hasData && apiStats.history?.length
    ? apiStats.history.map(h => ({
        date: new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        overall: h.overall_score || 0,
        empathy: h.scores?.empathy || 0,
        compliance: h.scores?.compliance || 0,
      }))
    : [];

  const competencyData = competencies.map(c => {
    if (!hasData) return { ...c, score: 0 };
    const keyMap = {
      'Empathy': apiStats.stats.avg_empathy,
      'Compliance': apiStats.stats.avg_compliance,
      'Info Gathering': apiStats.stats.avg_info_gathering,
      'Question Quality': apiStats.stats.avg_question_quality,
      'Tone Consistency': apiStats.stats.avg_tone,
      'Talk/Listen Ratio': apiStats.stats.avg_talk_listen,
    };
    const apiVal = keyMap[c.label];
    return { ...c, score: apiVal ? Math.round(apiVal) : 0 };
  });

  return (
    <div className="space-y-6">
      {/* ── header row ──────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Performance Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Track your improvement across all competency areas</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-0.5 flex gap-0.5">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setActivePeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                activePeriod === p
                  ? 'bg-white text-gray-900'
                  : 'text-gray-500 hover:text-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── trend chart ─────────────────────────────────────── */}
      <GlassCard className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-900">Score Trend</h2>
          {chartData.length > 0 && <CustomLegend />}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.06)' }} />
              <Line type="monotone" dataKey="overall"    stroke="#818cf8" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="empathy"    stroke="#c084fc" strokeWidth={2} strokeDasharray="6 3" dot={false} />
              <Line type="monotone" dataKey="compliance" stroke="#4ade80" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[240px] text-center">
            <p className="text-sm text-gray-500">No session data yet</p>
            <p className="text-xs text-gray-400 mt-1">Complete training sessions to see your progress over time</p>
          </div>
        )}
      </GlassCard>

      {/* ── competency breakdown ────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {competencyData.map((c) => (
          <GlassCard key={c.label} className="p-4" hover={false}>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>
              {c.score}<span className="text-sm font-normal text-gray-400">/100</span>
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${c.gradient}`}
                style={{ width: `${c.score}%` }}
              />
            </div>
          </GlassCard>
        ))}
      </div>

      {/* ── strengths vs weaknesses ─────────────────────────── */}
      {hasData ? (
        <div className="grid grid-cols-2 gap-4">
          <GlassCard className="p-5" hover={false}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
              <h3 className="text-sm font-medium text-gray-900">Strengths</h3>
            </div>
            {strengths.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 py-2.5 ${
                  i < strengths.length - 1 ? 'border-b border-gray-200' : ''
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shrink-0" />
                <span className="text-sm text-gray-800 flex-1">{item.text}</span>
                <span className="text-xs font-medium text-[#4ade80]">{item.delta}</span>
              </div>
            ))}
          </GlassCard>

          <GlassCard className="p-5" hover={false}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#f87171]" />
              <h3 className="text-sm font-medium text-gray-900">Areas for Improvement</h3>
            </div>
            {weaknesses.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 py-2.5 ${
                  i < weaknesses.length - 1 ? 'border-b border-gray-200' : ''
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#f87171] shrink-0" />
                <span className="text-sm text-gray-800 flex-1">{item.text}</span>
                <span className="text-xs font-medium text-[#f87171]">{item.delta}</span>
              </div>
            ))}
          </GlassCard>
        </div>
      ) : (
        <GlassCard className="p-8 text-center" hover={false}>
          <p className="text-sm text-gray-500">Strengths and improvement areas will appear after you complete training sessions</p>
        </GlassCard>
      )}
    </div>
  );
}
