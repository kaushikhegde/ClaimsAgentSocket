import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ConversationProvider } from '@elevenlabs/react';
import { Mic, MicOff, Phone, PhoneOff, Clock, AlertCircle, User, Bot, FileText, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { useTrainingCall } from '../hooks/useTrainingCall';
import { scoreLabel } from '../scoreLabels';
import { apiFetch } from '../api';
import { HANDOVER_FIELDS } from '../handoverFields';

/* ─── Avatar Components ──────────────────────────────────────── */

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

const DEFAULT_PERSONA = { name: 'Customer', gender: 'male', emotionalState: '' };

/* ─── Format Time ─────────────────────────────────────────────── */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Safety Actions Panel ────────────────────────────────────── */

function SafetyActionsPanel({ items, done, onAction }) {
  const doneAt = new Map(done.map((a) => [a.key, a.at]));
  return (
    <GlassCard hover={false} className="p-3 mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck size={13} className="text-[#464e7e]" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">System actions</p>
        <span className="text-[11px] text-gray-400">· click when you would action it in the system</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => {
          const at = doneAt.get(a.key);
          const isDone = at !== undefined;
          return (
            <button
              key={a.key}
              type="button"
              disabled={isDone}
              onClick={() => onAction(a.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isDone
                  ? 'border-green-400/30 bg-green-400/10 text-green-600'
                  : a.kind === 'claim'
                    ? 'border-[#464e7e]/30 bg-[#464e7e] text-white hover:brightness-110'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-[#464e7e]/40'
              }`}
            >
              {isDone && <CheckCircle size={12} />}
              {a.label}
              {isDone && <span className="text-[10px] text-green-600/70">{formatTime(at)}</span>}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}

/* ─── Handover Form ───────────────────────────────────────────── */

function HandoverForm({ personaName, onSubmit, onSkip }) {
  const [note, setNote] = useState(() => Object.fromEntries(HANDOVER_FIELDS.map((f) => [f.key, ''])));
  const filled = Object.values(note).some((v) => v.trim());
  return (
    <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center p-4">
      <GlassCard hover={false} className="p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900">Warm handover to Social Worker</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Write the case notes the social worker will read before contacting {personaName || 'the caller'}. Capture what they need so the caller does not have to repeat their story. This note is scored.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HANDOVER_FIELDS.map((f) => (
            <label key={f.key} className={f.key === 'summary' ? 'sm:col-span-2' : ''}>
              <span className="block text-xs font-medium text-gray-500 mb-1">{f.label}</span>
              <textarea
                rows={f.key === 'summary' ? 3 : 2}
                value={note[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setNote((n) => ({ ...n, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:border-[#464e7e]"
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onSkip} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50">
            Skip (scores 0)
          </button>
          <button type="button" disabled={!filled} onClick={() => onSubmit(note)} className="px-5 py-2 rounded-xl bg-[#464e7e] text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
            Submit handover &amp; evaluate
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

/* ─── Training Page ───────────────────────────────────────────── */

export default function Training() {
  return (
    <ConversationProvider>
      <TrainingCall />
    </ConversationProvider>
  );
}

function TrainingCall() {
  const { scenarioId } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'scripted';
  // Opened from the scenario builder's "Test this persona": pinned persona, tagged session.
  const pinnedPersonaId = searchParams.get('persona') || null;
  const isTestCall = searchParams.get('test') === '1';
  const navigate = useNavigate();
  const transcriptEndRef = useRef(null);

  const {
    phase, transcript, scenario, persona, result, errorMessage, timeRemaining, actions,
    mode: agentMode, isMuted, setMuted, start, end, reset, recordAction, submitHandover, skipHandover,
  } = useTrainingCall();

  // Features are known before the call starts so the content warning can gate it.
  const [preview, setPreview] = useState(null);
  const [warningAccepted, setWarningAccepted] = useState(false);
  useEffect(() => {
    apiFetch('/api/scenarios')
      .then((list) => setPreview((Array.isArray(list) ? list : []).find((s) => s.id === scenarioId) || null))
      .catch(() => {});
  }, [scenarioId]);
  const features = scenario?.features || preview?.features || null;
  const contentWarning = features?.contentWarning || null;
  const safetyActions = features?.safetyActions || [];

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const statusText =
    phase === 'active' && agentMode === 'speaking' ? 'Customer is speaking...'
    : phase === 'active' && isMuted ? 'Microphone muted'
    : phase === 'active' ? 'Listening...'
    : phase === 'connecting' ? 'Connecting...'
    : phase === 'processing' ? 'Evaluating your performance...'
    : 'Waiting for call to begin...';

  const handleStart = useCallback(
    () => start(scenarioId, mode, isTestCall ? 'Scenario test' : 'Sarah Kim', pinnedPersonaId),
    [start, scenarioId, mode, isTestCall, pinnedPersonaId]
  );
  const handleEndCall = useCallback(() => end(), [end]);
  const handleViewReview = useCallback(() => {
    navigate(`/sessions/${result?.sessionId || 'latest'}`);
  }, [navigate, result]);

  const status = phase;
  const maxDuration = scenario?.maxDurationSeconds || 180;
  const timeWarning = timeRemaining <= 30;
  const progress = ((maxDuration - timeRemaining) / maxDuration) * 100;
  const activePersona = persona || DEFAULT_PERSONA;
  const PersonaAvatar = activePersona.gender === 'female' ? FemaleAvatar : MaleAvatar;
  const modeLabel = mode === 'freestyle' && !features?.scriptedOnly && !pinnedPersonaId ? 'Freestyle' : 'Scripted';
  const scenarioLabel = scenario?.name || preview?.name || 'Training';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      {/* ── Top Bar ───────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="flex items-center justify-between px-6 h-14">
          {/* Left: Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#464e7e] flex items-center justify-center text-sm font-bold text-white">
              S
            </div>
            <span className="text-sm font-semibold text-gray-900">Scyne Training Assistance</span>
          </div>

          {/* Center: Timer */}
          {status === 'active' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="2.5" />
                  <circle
                    cx="20"
                    cy="20"
                    r="17"
                    fill="none"
                    stroke={timeWarning ? '#ef4444' : '#464e7e'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 17}`}
                    strokeDashoffset={`${2 * Math.PI * 17 * (1 - progress / 100)}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <Clock
                  size={14}
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${
                    timeWarning ? 'text-red-400' : 'text-gray-400'
                  }`}
                />
              </div>
              <span
                className={`text-2xl font-mono font-bold tabular-nums tracking-tight ${
                  timeWarning ? 'text-red-400 animate-pulse' : 'text-gray-900'
                }`}
              >
                {formatTime(timeRemaining)}
              </span>
            </div>
          )}

          {/* Right: Scenario pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200">
            <span className="text-xs text-gray-600">
              {scenarioLabel} · {modeLabel}
            </span>
            {isTestCall && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700" title="Started from the scenario builder; saved to history as “Scenario test”">Test call</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center pt-20 pb-28 px-4">
        <div className="w-full max-w-4xl flex flex-col flex-1">
          {/* Scenario Context Card */}
          <GlassCard hover={false} className="p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#eef0f6] flex items-center justify-center">
                <PersonaAvatar />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <p className="text-sm font-medium text-gray-900">
                    You're speaking with {activePersona.name}
                  </p>
                  <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#464e7e]/10 text-[#464e7e]">
                    {modeLabel}
                  </span>
                  {scenario?.documentCount > 0 && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-gray-400">
                      <FileText size={11} /> {scenario.documentCount} document{scenario.documentCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{activePersona.emotionalState}</p>
              </div>
            </div>
          </GlassCard>

          {/* Safety Actions Panel */}
          {status === 'active' && safetyActions.length > 0 && (
            <SafetyActionsPanel items={safetyActions} done={actions} onAction={recordAction} />
          )}

          {/* Transcript Area */}
          <GlassCard
            hover={false}
            className="flex-1 p-4 overflow-y-auto min-h-[300px] max-h-[calc(100vh-320px)]"
          >
            {status === 'idle' || status === 'connecting' ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                {status === 'idle' ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-[#eef0f6] border border-gray-200 flex items-center justify-center">
                      <Phone size={28} className="text-[#464e7e]" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-900 font-medium mb-1">Ready to begin?</p>
                      <p className="text-xs text-gray-500 max-w-xs">
                        You'll be connected with a caller for a {formatTime(preview?.maxDurationSeconds || maxDuration)} training session.
                      </p>
                      {mode === 'freestyle' && features?.scriptedOnly && (
                        <p className="text-[11px] text-gray-400 mt-1">This scenario runs in scripted mode only.</p>
                      )}
                    </div>
                    {contentWarning && (
                      <div className="max-w-md rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-left">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={13} /> Content warning</p>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">{contentWarning}</p>
                        <label className="flex items-center gap-2 mt-2 text-xs text-amber-900">
                          <input type="checkbox" checked={warningAccepted} onChange={(e) => setWarningAccepted(e.target.checked)} />
                          I understand and want to continue
                        </label>
                      </div>
                    )}
                    {safetyActions.length > 0 && (
                      <p className="text-[11px] text-gray-400 max-w-sm text-center">
                        During the call, use the <span className="font-medium text-gray-500">System actions</span> panel to record when you would protect the caller's records and open the claim.
                      </p>
                    )}
                    <button
                      onClick={handleStart}
                      disabled={!!contentWarning && !warningAccepted}
                      className="mt-2 px-6 py-3 rounded-xl bg-[#464e7e] text-sm font-semibold text-white shadow-lg shadow-[#464e7e]/20 transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Start Training
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full border-2 border-[#464e7e]/30 border-t-[#464e7e] animate-spin" />
                    <p className="text-sm text-gray-500">Connecting to session...</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {transcript.length === 0 && status === 'active' && (
                  <div className="flex items-center justify-center py-12 gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#464e7e] animate-pulse" />
                    <span className="text-sm text-gray-500">Waiting for call to begin...</span>
                  </div>
                )}
                {transcript.map((msg, i) => {
                  const isAgent = msg.role === 'agent';
                  return (
                    <div key={i} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                          isAgent
                            ? 'bg-[#eef0f6] border border-[#464e7e]/20 rounded-br-md'
                            : 'bg-gray-50 border border-gray-200 rounded-bl-md'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {isAgent ? (
                            <Bot size={12} className="text-[#464e7e]" />
                          ) : (
                            <User size={12} className="text-[#5a6396]" />
                          )}
                          <span
                            className={`text-[10px] font-medium uppercase tracking-wider ${
                              isAgent ? 'text-[#464e7e]/70' : 'text-[#5a6396]/70'
                            }`}
                          >
                            {isAgent ? 'You (Agent)' : activePersona.name}
                          </span>
                          {msg.timestamp && (
                            <span className="text-[10px] text-gray-300 ml-auto">{msg.timestamp}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </GlassCard>

          {/* Status Bar */}
          {status === 'active' && (
            <div className="flex items-center gap-3 mt-3 px-1">
              <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
              <span className="text-xs text-gray-500">{statusText}</span>
              <div className="flex items-end gap-[2px] ml-auto h-3">
                {[0.4, 0.7, 1, 0.6, 0.3].map((h, i) => (
                  <div
                    key={i}
                    className={`w-[3px] rounded-full ${agentMode === 'speaking' ? 'bg-[#464e7e]/70 animate-pulse' : 'bg-[#464e7e]/40'}`}
                    style={{ height: `${h * 12}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Controls ───────────────────────────────── */}
      {status === 'active' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-gray-200">
          <div className="flex items-center justify-center gap-6 py-4">
            <button
              onClick={() => setMuted(!isMuted)}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                isMuted
                  ? 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/30'
                  : 'bg-[#464e7e] shadow-lg shadow-[#464e7e]/25 hover:brightness-110'
              }`}
            >
              {isMuted ? <MicOff size={24} className="text-red-400" /> : <Mic size={24} className="text-white" />}
            </button>

            <button
              onClick={handleEndCall}
              aria-label="End call"
              className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all duration-200"
            >
              <PhoneOff size={20} className="text-red-400" />
            </button>
          </div>
        </div>
      )}

      {/* ── Handover Overlay ──────────────────────────────── */}
      {status === 'handover' && (
        <HandoverForm personaName={activePersona.name} onSubmit={submitHandover} onSkip={skipHandover} />
      )}

      {/* ── Processing / Complete Overlay ─────────────────── */}
      {(status === 'processing' || status === 'complete') && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center">
          {status === 'processing' ? (
            <GlassCard hover={false} className="p-8 text-center max-w-sm">
              <div className="w-14 h-14 rounded-full border-[2.5px] border-[#464e7e]/20 border-t-[#464e7e] animate-spin mx-auto mb-5" />
              <h2 className="text-lg font-semibold text-gray-900 mb-1.5">Evaluating your performance...</h2>
              <p className="text-xs text-gray-500">
                {features?.handoverNote ? 'Scoring the call, your system actions and the handover note' : 'Analyzing empathy, compliance, and information gathering'}
              </p>
            </GlassCard>
          ) : (
            <GlassCard hover={false} className="p-8 max-w-md w-full">
              <div className="text-center mb-6">
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="5" />
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      fill="none"
                      stroke="url(#scoreGradient)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - (result?.overallScore || 0) / 100)}`}
                    />
                    <defs>
                      <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#464e7e" />
                        <stop offset="100%" stopColor="#5a6396" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-900">
                    {result?.overallScore}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Training Complete</h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{result?.summary}</p>
              </div>

              {result?.scores && (
                <div className="space-y-3 mb-6">
                  {Object.entries(result.scores).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-gray-500">{scoreLabel(key)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-[#464e7e]" style={{ width: `${value}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-900 w-7 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleViewReview}
                className="w-full py-3 rounded-xl bg-[#464e7e] text-sm font-semibold text-white shadow-lg shadow-[#464e7e]/20 transition hover:brightness-110 active:scale-[0.98]"
              >
                View Full Review →
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full mt-2.5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition"
              >
                Back to Dashboard
              </button>
            </GlassCard>
          )}
        </div>
      )}

      {/* ── Empty Overlay ─────────────────────────────────── */}
      {status === 'empty' && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center">
          <GlassCard hover={false} className="p-8 text-center max-w-sm">
            <Phone size={44} className="text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1.5">No conversation recorded</h2>
            <p className="text-xs text-gray-500 mb-5">The call ended before anything was said, so there is nothing to evaluate.</p>
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-xl bg-[#464e7e] text-sm font-semibold text-white transition hover:brightness-110"
            >
              Try Again
            </button>
          </GlassCard>
        </div>
      )}

      {/* ── Error Overlay ─────────────────────────────────── */}
      {status === 'error' && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center">
          <GlassCard hover={false} className="p-8 text-center max-w-sm">
            <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1.5">Session Error</h2>
            <p className="text-xs text-gray-500 mb-5">
              {errorMessage || 'Unable to connect to the training session. This may be a network issue.'}
            </p>
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-xl bg-[#464e7e] text-sm font-semibold text-white transition hover:brightness-110"
            >
              Try Again
            </button>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
