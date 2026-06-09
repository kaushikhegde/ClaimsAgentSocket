import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, TrendingUp, TrendingDown, MessageSquare, Target, ArrowRight } from 'lucide-react';
import GlassCard from '../components/GlassCard';

const TIPS = [
  {
    title: 'Ask One Question at a Time',
    description: 'Customers feel overwhelmed when multiple questions are asked in one turn. Break them up — one question per response keeps the conversation natural and gives you cleaner answers.',
    category: 'Question Quality',
    icon: MessageSquare,
  },
  {
    title: 'Mirror Emotional Language',
    description: 'When a customer says "I\'m scared" or "I\'m frustrated," acknowledge it by reflecting their words back: "I understand you\'re feeling scared..." This builds trust faster than generic empathy phrases.',
    category: 'Empathy',
    icon: Target,
  },
  {
    title: 'Let the Customer Finish',
    description: 'Your talk/listen ratio is above target. Pause 1-2 seconds after the customer stops speaking before responding — they often add important details in that silence.',
    category: 'Talk/Listen Ratio',
    icon: TrendingDown,
  },
  {
    title: 'Always Probe Severity',
    description: 'When a customer mentions pain or injury, always follow up with a severity question: "On a scale of 1-10, how would you rate your pain right now?" This is critical for proper claim classification.',
    category: 'Information Gathering',
    icon: TrendingUp,
  },
];

export default function Coaching() {
  const navigate = useNavigate();
  const [hasData, setHasData] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats?agent=default')
      .then((r) => r.json())
      .then((data) => {
        if (data?.stats && Number(data.stats.total_sessions) > 0) {
          setHasData(true);
          setStats(data.stats);
        }
      })
      .catch(() => {});
  }, []);

  const focusAreas = hasData && stats
    ? [
        {
          area: 'Question Quality',
          current: Math.round(Number(stats.avg_question_quality) || 0),
          target: 85,
          tip: 'Practice single-question turns in your next 3 sessions',
        },
        {
          area: 'Talk/Listen Ratio',
          current: Math.round(Number(stats.avg_talk_listen) || 0),
          target: 80,
          tip: 'Count to 2 after the customer finishes before responding',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">Coaching Hub</h1>
        <p className="text-sm text-gray-500 mt-1">
          Personalized tips and focus areas based on your training sessions
        </p>
      </div>

      {/* Weekly Focus */}
      <GlassCard hover={false} className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={16} className="text-[#464e7e]" />
          <h2 className="text-sm font-semibold text-gray-900">This Week's Focus</h2>
        </div>
        {focusAreas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {focusAreas.map((f) => (
              <div
                key={f.area}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-800">{f.area}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Current</span>
                    <span className="text-amber-400 font-semibold">{f.current}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-500">Target</span>
                    <span className="text-green-400 font-semibold">{f.target}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
                    style={{ width: `${f.current}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">{f.tip}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">Complete training sessions to get personalized focus areas</p>
            <button
              onClick={() => navigate('/scenarios')}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#464e7e] hover:text-[#5a6396] transition-colors"
            >
              Start a Training Session <ArrowRight size={12} />
            </button>
          </div>
        )}
      </GlassCard>

      {/* Coaching Tips — these are general best practices, always show */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">General Coaching Tips</h2>
        <p className="text-xs text-gray-400 mb-4">Best practices for handling insurance claims calls</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TIPS.map((tip) => {
            const Icon = tip.icon;
            return (
              <GlassCard key={tip.title} className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#464e7e]/[0.1] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={16} className="text-[#464e7e]" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                      {tip.category}
                    </p>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1.5">{tip.title}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">{tip.description}</p>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
