import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import GlassCard from '../components/GlassCard';

const MaleAvatar = () => (
  <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
    {/* Head */}
    <circle cx="40" cy="26" r="14" fill="#d4a574" />
    {/* Short hair */}
    <path d="M26 22c0-10 6-16 14-16s14 6 14 16" fill="#3d2b1f" />
    <rect x="26" y="18" width="28" height="6" rx="3" fill="#3d2b1f" />
    {/* Eyes */}
    <circle cx="34" cy="27" r="2" fill="#2d2d2d" />
    <circle cx="46" cy="27" r="2" fill="#2d2d2d" />
    {/* Mouth */}
    <path d="M36 33c2 2 6 2 8 0" stroke="#b8896a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Body - shirt */}
    <path d="M16 68c0-13.255 10.745-24 24-24s24 10.745 24 24" fill="#464e7e" />
    {/* Collar */}
    <path d="M34 44l6 6 6-6" stroke="#3a4169" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

const FemaleAvatar = () => (
  <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
    {/* Long hair behind */}
    <path d="M22 24c0-12 8-20 18-20s18 8 18 20c0 6-1 14-4 20h-28c-3-6-4-14-4-20z" fill="#5c3317" />
    {/* Head */}
    <circle cx="40" cy="26" r="14" fill="#e8b89d" />
    {/* Hair fringe */}
    <path d="M26 22c0-10 6-16 14-16s14 6 14 16" fill="#5c3317" />
    <path d="M26 22c2-2 5-3 8-2" stroke="#5c3317" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M54 22c-2-2-5-3-8-2" stroke="#5c3317" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* Hair sides */}
    <path d="M24 26c-1 6 0 14 2 18" stroke="#5c3317" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M56 26c1 6 0 14-2 18" stroke="#5c3317" strokeWidth="4" fill="none" strokeLinecap="round" />
    {/* Eyes */}
    <circle cx="34" cy="27" r="2" fill="#2d2d2d" />
    <circle cx="46" cy="27" r="2" fill="#2d2d2d" />
    {/* Eyelashes */}
    <path d="M32 25l-1-1.5M34 24.5v-1.5M36 25l1-1.5" stroke="#2d2d2d" strokeWidth="0.8" strokeLinecap="round" />
    <path d="M44 25l-1-1.5M46 24.5v-1.5M48 25l1-1.5" stroke="#2d2d2d" strokeWidth="0.8" strokeLinecap="round" />
    {/* Lips */}
    <path d="M36 33c2 2.5 6 2.5 8 0" stroke="#c47a6a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Body - blouse */}
    <path d="M16 68c0-13.255 10.745-24 24-24s24 10.745 24 24" fill="#6b5b95" />
    {/* Neckline */}
    <path d="M34 44c3 4 9 4 12 0" stroke="#5a4d80" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

function pickRandomPersona(scenario) {
  if (scenario.personas && scenario.personas.length > 0) {
    return scenario.personas[Math.floor(Math.random() * scenario.personas.length)];
  }
  return { name: scenario.personaName || 'Unknown', gender: scenario.gender || 'male', emotionalState: scenario.emotionalState || '' };
}

const DIFFICULTY_BADGE = {
  beginner: 'bg-green-400/10 text-green-400',
  intermediate: 'bg-amber-400/10 text-amber-400',
  advanced: 'bg-red-400/10 text-red-400',
};

const FALLBACK_SCENARIOS = [
  {
    id: 'chest-injury',
    name: 'Chest Injury Claim',
    description: 'Injured worker reporting severe chest pain from a warehouse lifting incident.',
    difficulty: 'beginner',
    maxDurationSeconds: 180,
    personas: [
      { name: 'Marcus Johnson', gender: 'male', emotionalState: 'distressed, in pain, worried about finances' },
      { name: 'Sarah Mitchell', gender: 'female', emotionalState: 'anxious, scared, confused about the process' },
      { name: 'David Nguyen', gender: 'male', emotionalState: 'frustrated, angry at management' },
    ],
  },
  {
    id: 'hearing-loss',
    name: 'Noise-Induced Hearing Loss',
    description: 'Factory worker filing claim for gradual hearing deterioration over 5 years of machinery exposure.',
    difficulty: 'intermediate',
    maxDurationSeconds: 180,
    personas: [
      { name: 'Linda Torres', gender: 'female', emotionalState: 'frustrated, confused about process, somewhat angry at employer' },
      { name: 'James Kowalski', gender: 'male', emotionalState: 'worried about career, quiet and stoic but deeply concerned' },
      { name: 'Priya Desai', gender: 'female', emotionalState: 'articulate but frustrated, feels let down by employer' },
    ],
  },
  {
    id: 'physical-injury',
    name: 'Physical Injury',
    description: 'Construction site fall resulting in multiple fractures.',
    difficulty: 'advanced',
    maxDurationSeconds: 180,
    personas: [
      { name: 'Robert Williams', gender: 'male', emotionalState: 'angry, demanding, scared about finances' },
      { name: 'Elena Vasquez', gender: 'female', emotionalState: 'scared, defensive, worried employer will blame her' },
      { name: 'Tyrone Jacobs', gender: 'male', emotionalState: 'in pain, groggy from medication, overwhelmed' },
    ],
  },
];

export default function Scenarios() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState(FALLBACK_SCENARIOS);
  const [mode, setMode] = useState('scripted');

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setScenarios(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">Training Scenarios</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a scenario to begin your training session
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">Mode:</span>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-0.5 flex gap-0.5">
          <button
            onClick={() => setMode('scripted')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'scripted'
                ? 'bg-white text-gray-900'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Scripted Persona
          </button>
          <button
            onClick={() => setMode('freestyle')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'freestyle'
                ? 'bg-white text-gray-900'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Freestyle
          </button>
        </div>
      </div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {scenarios.map((s) => {
          const persona = pickRandomPersona(s);
          const diffStyle = DIFFICULTY_BADGE[s.difficulty] || DIFFICULTY_BADGE.intermediate;

          return (
            <GlassCard key={s.id} className="p-6 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#eef0f6] overflow-hidden">
                  {persona.gender === 'female' ? <FemaleAvatar /> : <MaleAvatar />}
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${diffStyle}`}>
                  {s.difficulty}
                </span>
              </div>

              <h3 className="text-base font-semibold text-gray-900 mb-1.5">{s.name}</h3>
              <p className="text-xs text-gray-500 leading-relaxed flex-1">{s.description}</p>

              {mode === 'scripted' && persona.name && (
                <div className="mt-3 p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1">Persona</p>
                  <p className="text-xs text-gray-600 font-medium">{persona.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{persona.emotionalState}</p>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={12} /> {Math.floor((s.maxDurationSeconds || 180) / 60)} min max
                </span>
                <button
                  onClick={() => navigate(`/training/${s.id}?mode=${mode}`)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] hover:text-[#5a6396] transition-colors"
                >
                  Start Training <ArrowRight size={12} />
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
