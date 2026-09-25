import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Users, Clock, ArrowRight, Copy } from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import UsageBadge from '../../components/UsageBadge';
import { useUsage } from '../../hooks/useUsage';
import { apiFetch } from '../../api';

const DIFFICULTY_BADGE = {
  beginner: 'bg-green-400/10 text-green-400',
  intermediate: 'bg-amber-400/10 text-amber-400',
  advanced: 'bg-red-400/10 text-red-400',
};

export default function ScenarioList() {
  const [scenarios, setScenarios] = useState([]);
  const [error, setError] = useState('');
  const { usage } = useUsage();

  useEffect(() => {
    apiFetch('/api/scenarios').then(setScenarios).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">Scenario Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Define scenarios, personas, voices and supporting documents.</p>
        </div>
        <div className="flex items-center gap-3">
          <UsageBadge usage={usage} />
          <Link to="/admin/scenarios/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#464e7e] text-sm font-medium text-white hover:brightness-110">
            <Plus size={14} /> New scenario
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {scenarios.map((s) => (
          <GlassCard key={s.id} className="p-6 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">{s.name}</h3>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${DIFFICULTY_BADGE[s.difficulty] || DIFFICULTY_BADGE.intermediate}`}>{s.difficulty}</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed flex-1">{s.description}</p>
            <div className="flex items-center gap-4 mt-4 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1"><Users size={12} /> {s.personas.length} persona{s.personas.length === 1 ? '' : 's'}</span>
              <span className="inline-flex items-center gap-1"><FileText size={12} /> {s.documentCount} doc{s.documentCount === 1 ? '' : 's'}</span>
              <span className="inline-flex items-center gap-1"><Clock size={12} /> {Math.round(s.maxDurationSeconds / 60)} min</span>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end gap-4">
              <Link to={`/admin/scenarios/new?from=${s.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"><Copy size={12} /> Duplicate</Link>
              <Link to={`/admin/scenarios/${s.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] hover:text-[#5a6396]">Edit <ArrowRight size={12} /></Link>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
