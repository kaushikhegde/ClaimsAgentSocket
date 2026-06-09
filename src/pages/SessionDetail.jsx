import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, AlertTriangle, Pen, Clock, CheckCircle, XCircle } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import GlassCard from '../components/GlassCard';

/* ─── RTWASA Items ────────────────────────────────────────────── */

const RTWASA_LABELS = {
  incomeSupport: 'Income Support (100% → 80% weekly earnings)',
  medicalSupport: 'Medical & Treatment Expenses',
  returnToWorkServices: 'Return to Work Services',
  seriousInjuryClassification: 'Serious Injury Classification',
  lumpSumPayments: 'Lump Sum Payments',
  legalReference: 'Return to Work Act 2014 Reference',
};

/* ─── Competency Gradients ────────────────────────────────────── */

const COMPETENCY_GRADIENTS = {
  empathy: 'from-purple-500 to-purple-400',
  compliance: 'from-amber-500 to-amber-400',
  informationGathering: 'from-indigo-500 to-indigo-400',
  questionQuality: 'from-green-500 to-green-400',
  toneConsistency: 'from-teal-500 to-teal-400',
  talkListenRatio: 'from-rose-500 to-rose-400',
  fillerWords: 'from-blue-500 to-blue-400',
  responseTime: 'from-cyan-500 to-cyan-400',
  rtwasaCompliance: 'from-sky-500 to-sky-400',
};

const COMPETENCY_LABELS = {
  empathy: 'Empathy',
  compliance: 'Compliance',
  informationGathering: 'Info Gathering',
  questionQuality: 'Question Quality',
  toneConsistency: 'Tone Consistency',
  talkListenRatio: 'Talk / Listen',
  fillerWords: 'Filler Words',
  responseTime: 'Response Time',
  rtwasaCompliance: 'RTWASA Compliance',
};

/* ─── Custom Tooltip ───────────────────────────────────────────── */

function SentimentTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white shadow-lg border border-gray-200 px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

/* ─── Y-Axis Tick ─────────────────────────────────────────────── */

function SentimentTick({ x, y, payload }) {
  const labels = { 1: 'Positive', 0: 'Neutral', '-1': 'Negative' };
  const label = labels[String(payload.value)];
  if (!label) return null;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#9ca3af" fontSize={11}>
      {label}
    </text>
  );
}

/* ─── Helper: format relative time ────────────────────────────── */

function formatRelativeTime(timestamp, sessionStart) {
  if (!timestamp || !sessionStart) return '';
  const diff = Math.max(0, Math.round((new Date(timestamp) - new Date(sessionStart)) / 1000));
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`;
}

/* ─── Session Detail ──────────────────────────────────────────── */

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.id) setSession(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500 text-sm">Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <p className="text-gray-500 text-sm">Session not found</p>
        <button onClick={() => navigate('/sessions')} className="text-xs text-[#464e7e] hover:underline">
          Back to History
        </button>
      </div>
    );
  }

  // Build score cards from real data
  const scoreCards = [
    { label: 'Overall', value: session.overall_score || 0, color: '#4ade80' },
    { label: 'Empathy', value: session.scores?.empathy || 0, color: '#c084fc' },
    { label: 'Compliance', value: session.scores?.compliance || 0, color: '#fbbf24' },
    { label: 'Info Gathering', value: session.scores?.informationGathering || 0, color: '#818cf8' },
    { label: 'Talk / Listen', value: session.scores?.talkListenRatio || 0, color: '#fb7185' },
    { label: 'RTWASA', value: session.scores?.rtwasaCompliance || 0, color: '#38bdf8' },
  ];

  // Build transcript from conversation logs
  const transcript = session.logs && session.logs.length > 0
    ? session.logs.map(l => ({
        role: l.role || 'customer',
        time: formatRelativeTime(l.timestamp, session.created_at),
        text: l.message || l.text || l.content || '',
      }))
    : [];

  // Sentiment data
  const sentimentData = Array.isArray(session.sentiment) && session.sentiment.length > 0
    ? session.sentiment.map(s => ({
        time: typeof s.timestamp === 'number'
          ? `${Math.floor(s.timestamp / 60)}:${String(s.timestamp % 60).padStart(2, '0')}`
          : s.timestamp || '',
        agent: s.agentTone ?? 0,
        customer: s.customerMood ?? 0,
      }))
    : [];

  // Coaching data
  const coaching = session.coaching || {};
  const strengths = Array.isArray(coaching.strengths) ? coaching.strengths : [];
  const improvements = Array.isArray(coaching.improvements) ? coaching.improvements : [];
  const alternatives = Array.isArray(coaching.alternatives) ? coaching.alternatives : [];

  // Competency breakdown from scores
  const competencies = Object.entries(session.scores || {}).map(([key, value]) => ({
    key,
    label: COMPETENCY_LABELS[key] || key,
    value: value || 0,
    gradient: COMPETENCY_GRADIENTS[key] || 'from-gray-500 to-gray-400',
  }));

  // RTWASA breakdown
  const rtwasaBreakdown = session.rtwasa_breakdown || {};

  const sessionTitle = session.scenario_name
    ? `${session.scenario_name} — Session Review`
    : 'Session Review';

  const sessionDate = session.created_at
    ? new Date(session.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : '';

  const sessionDuration = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
    : '';

  const personaLabel = session.persona_name
    ? `${session.persona_name} (${session.scenario_mode || 'Scripted'})`
    : '';

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/sessions')}
          className="text-xs text-gray-500 hover:text-[#464e7e] transition-colors inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft size={13} /> Back to History
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
              {sessionTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-gray-500">
              {sessionDate && <span>{sessionDate}</span>}
              {sessionDuration && (
                <>
                  <span className="text-gray-300">&middot;</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> Duration: {sessionDuration}
                  </span>
                </>
              )}
              {personaLabel && (
                <>
                  <span className="text-gray-300">&middot;</span>
                  <span>Persona: {personaLabel}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              Retry Scenario
            </button>
            <button className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Score Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {scoreCards.map((s) => (
          <GlassCard key={s.label} className="p-5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              {s.label}
            </p>
            <p className="text-[28px] font-bold mt-1" style={{ color: s.color }}>
              {s.value}
            </p>
          </GlassCard>
        ))}
      </div>

      {/* ── Sentiment Over Time ─────────────────────────────── */}
      {sentimentData.length > 0 && (
        <GlassCard hover={false} className="p-5">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Sentiment Over Time
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={sentimentData} margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
              <defs>
                <linearGradient id="customerFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[-1, 1]}
                ticks={[-1, 0, 1]}
                tick={<SentimentTick />}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<SentimentTooltip />} />
              <Area
                type="monotone"
                dataKey="agent"
                name="Agent Tone"
                stroke="#818cf8"
                strokeWidth={2}
                fill="none"
                dot={{ r: 3, fill: '#ffffff', stroke: '#818cf8', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: '#818cf8', stroke: '#ffffff', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="customer"
                name="Customer Mood"
                stroke="#c084fc"
                strokeWidth={2}
                fill="url(#customerFill)"
                dot={{ r: 3, fill: '#ffffff', stroke: '#c084fc', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: '#c084fc', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-0.5 rounded-full bg-[#818cf8] inline-block" /> Agent Tone
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-0.5 rounded-full bg-[#c084fc] inline-block" /> Customer Mood
            </span>
          </div>
        </GlassCard>
      )}

      {/* ── Transcript + Coaching ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Transcript Panel */}
        <GlassCard hover={false} className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider">
              Full Transcript
            </h2>
            <span className="inline-flex items-center rounded-full bg-green-400/10 px-2.5 py-0.5 text-[11px] font-medium text-green-400">
              {transcript.length} turns
            </span>
          </div>

          {/* Audio Player */}
          {session.audio_file_path && (
            <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                Session Recording
              </p>
              <audio controls className="w-full h-8" src={`/api/sessions/${id}/audio`}>
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {transcript.length > 0 ? (
            <div className="max-h-[480px] overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {transcript.map((msg, i) => {
                const isAgent = msg.role === 'agent';
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                          isAgent ? 'text-[#464e7e]' : 'text-[#5a6396]'
                        }`}
                      >
                        {isAgent ? 'Agent (You)' : 'Customer'}
                      </span>
                      <span className="text-[10px] text-gray-300">{msg.time}</span>
                    </div>
                    <p className="text-[13px] text-gray-600 leading-relaxed">{msg.text}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No transcript available for this session.</p>
          )}
        </GlassCard>

        {/* Coaching Panel */}
        <GlassCard hover={false} className="p-5 flex flex-col">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            AI Coaching Feedback
          </h2>

          <div className="space-y-5 overflow-y-auto max-h-[480px] pr-1 scrollbar-thin">
            {/* What You Did Well */}
            {strengths.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Check size={14} className="text-green-400" />
                  <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">
                    What You Did Well
                  </span>
                </div>
                <div className="space-y-2">
                  {strengths.map((item, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <p className="text-[13px] text-gray-600 leading-relaxed">
                        {item.text || item}
                        {item.reference && (
                          <span className="text-[10px] text-gray-400 ml-2">({item.reference})</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Areas to Improve */}
            {improvements.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                    Areas to Improve
                  </span>
                </div>
                <div className="space-y-2">
                  {improvements.map((item, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <p className="text-[13px] text-gray-600 leading-relaxed">
                        {item.text || item}
                        {item.reference && (
                          <span className="text-[10px] text-gray-400 ml-2">({item.reference})</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Alternatives */}
            {alternatives.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Pen size={14} className="text-[#464e7e]" />
                  <span className="text-[11px] font-semibold text-[#464e7e] uppercase tracking-wider">
                    Suggested Alternatives
                  </span>
                </div>
                {alternatives.map((alt, i) => (
                  <div key={i} className="bg-[#eef0f6] border border-[#464e7e]/[0.15] rounded-xl p-3 space-y-2.5 mb-2">
                    {alt.original && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                          Instead of {alt.reference ? `(${alt.reference})` : ''}
                        </p>
                        <p className="text-[13px] text-gray-500 leading-relaxed italic">
                          &ldquo;{alt.original}&rdquo;
                        </p>
                      </div>
                    )}
                    {alt.suggested && (
                      <div className={alt.original ? 'border-t border-[#464e7e]/[0.15] pt-2.5' : ''}>
                        <p className="text-[10px] uppercase tracking-wider text-[#464e7e] font-medium mb-1">
                          Try this
                        </p>
                        <p className="text-[13px] text-gray-600 leading-relaxed">
                          &ldquo;{alt.suggested}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── RTWASA Compliance Breakdown ─────────────────────── */}
      {Object.keys(rtwasaBreakdown).length > 0 && (
        <GlassCard hover={false} className="p-5">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            RTWASA Interim Benefits Compliance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(RTWASA_LABELS).map(([key, label]) => {
              const item = rtwasaBreakdown[key] || { mentioned: false, details: '' };
              return (
                <div
                  key={key}
                  className={`rounded-xl p-3 border ${
                    item.mentioned
                      ? 'bg-green-400/[0.06] border-green-400/[0.15]'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.mentioned ? (
                      <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={16} className="text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-[13px] font-medium ${item.mentioned ? 'text-green-400' : 'text-gray-500'}`}>
                        {label}
                      </p>
                      {item.details && (
                        <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{item.details}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Competency Breakdown ────────────────────────────── */}
      {competencies.length > 0 && (
        <GlassCard hover={false} className="p-5">
          <h2 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Competency Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {competencies.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-[140px] shrink-0 text-sm text-gray-500">{c.label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${c.gradient}`}
                    style={{ width: `${c.value}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 w-8 text-right">{c.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
