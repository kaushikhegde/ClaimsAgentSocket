import { Zap } from 'lucide-react';

export default function UsageBadge({ usage }) {
  if (!usage) return null;
  const pct = usage.creditsLimit ? Math.min(100, Math.round((usage.creditsUsed / usage.creditsLimit) * 100)) : 0;
  const resets = usage.resetsAt ? new Date(usage.resetsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-600" title="ElevenLabs credits used this billing period">
      <Zap size={12} className={pct >= 90 ? 'text-red-400' : 'text-[#464e7e]'} />
      <span className="font-medium text-gray-900">{usage.creditsUsed.toLocaleString()}</span>
      <span className="text-gray-400">/ {usage.creditsLimit.toLocaleString()} credits</span>
      <span className="uppercase tracking-wider text-[10px] text-gray-400">· {usage.tier}</span>
      {resets && <span className="text-gray-400">· resets {resets}</span>}
    </div>
  );
}
