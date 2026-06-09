import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, MicOff, Phone, PhoneOff, Clock, AlertCircle, User, Bot } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { useAudio } from '../hooks/useAudio';
import { useWebSocket } from '../hooks/useWebSocket';

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

/* ─── Scenario Data ───────────────────────────────────────────── */

const SCENARIOS = {
  'chest-injury': {
    id: 'chest-injury',
    title: 'Chest Injury Claim',
    type: 'Scripted',
    category: 'Chest Injury',
    duration: 180,
  },
  'hearing-loss': {
    id: 'hearing-loss',
    title: 'Noise-Induced Hearing Loss',
    type: 'Scripted',
    category: 'Hearing Loss',
    duration: 180,
  },
  'physical-injury': {
    id: 'physical-injury',
    title: 'Physical Injury',
    type: 'Scripted',
    category: 'Physical Injury',
    duration: 180,
  },
};

const DEFAULT_PERSONA = { name: 'Customer', gender: 'male', emotionalState: '' };

/* ─── Format Time ─────────────────────────────────────────────── */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Training Page ───────────────────────────────────────────── */

export default function Training() {
  const { scenarioId } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'scripted';
  const navigate = useNavigate();
  const scenario = SCENARIOS[scenarioId];

  const audioHooksRef = useRef(null);

  const {
    status,
    setStatus,
    transcript,
    timeRemaining,
    setTimeRemaining,
    result,
    setResult,
    persona: serverPersona,
    connect,
    endSession,
    disconnect,
    wsRef,
  } = useWebSocket({
    onAudio: (data) => {
      // Mute mic while Gemini speaks
      if (audioHooksRef.current && !audioHooksRef.current._playbackStarted) {
        audioHooksRef.current._playbackStarted = true;
        audioHooksRef.current.muteForPlayback();
      }
      audioHooksRef.current?.playAudio(data);
    },
    onGreetingDone: () => {
      // Customer finished opening statement — start capturing agent audio
      audioHooksRef.current?.startProcessing();
      audioHooksRef.current?.scheduleUnmute();
      audioHooksRef.current._playbackStarted = false;
    },
    onTurnComplete: () => {
      // Gemini finished a turn — unmute mic after audio drains
      audioHooksRef.current?.scheduleUnmute();
      audioHooksRef.current._playbackStarted = false;
    },
  });

  const {
    isMuted,
    startCapture,
    startProcessing,
    stopCapture,
    toggleMute,
    playAudio,
    muteForPlayback,
    scheduleUnmute,
  } = useAudio(wsRef);

  // Keep audioHooksRef in sync
  useEffect(() => {
    audioHooksRef.current = { playAudio, muteForPlayback, scheduleUnmute, startProcessing, _playbackStarted: false };
  }, [playAudio, muteForPlayback, scheduleUnmute, startProcessing]);

  const transcriptEndRef = useRef(null);
  const timerRef = useRef(null);
  const [localTime, setLocalTime] = useState(scenario?.duration || 180);
  const [statusText, setStatusText] = useState('Waiting for call to begin...');

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Timer countdown when active
  useEffect(() => {
    if (status === 'active') {
      timerRef.current = setInterval(() => {
        setLocalTime((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            endSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, endSession]);

  // Sync WS time warnings
  useEffect(() => {
    if (timeRemaining < localTime) {
      setLocalTime(timeRemaining);
    }
  }, [timeRemaining]);

  // Status text updates
  useEffect(() => {
    if (status === 'active' && !isMuted) setStatusText('Listening...');
    else if (status === 'active' && isMuted) setStatusText('Customer is speaking...');
    else if (status === 'connecting') setStatusText('Connecting...');
    else if (status === 'processing') setStatusText('Evaluating your performance...');
  }, [status, isMuted]);

  // Handle start
  const handleStart = useCallback(async () => {
    const micGranted = await startCapture();
    if (!micGranted) {
      setStatusText('Microphone access denied. Please allow microphone access and try again.');
      return;
    }
    connect(scenarioId, mode);
  }, [scenarioId, mode, connect, startCapture]);

  // Handle end call
  const handleEndCall = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopCapture();
    endSession();
  }, [stopCapture, endSession]);

  // Handle navigate to review
  const handleViewReview = useCallback(() => {
    disconnect();
    navigate(`/sessions/${result?.sessionId || 'latest'}`);
  }, [disconnect, navigate, result]);

  // Unknown scenario
  if (!scenario) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <GlassCard className="p-8 text-center max-w-md">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Scenario Not Found</h2>
          <p className="text-gray-500 text-sm mb-6">
            The training scenario "{scenarioId}" doesn't exist.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg bg-[#464e7e] text-sm font-medium text-white"
          >
            Back to Dashboard
          </button>
        </GlassCard>
      </div>
    );
  }

  const timeWarning = localTime <= 30;
  const progress = ((scenario.duration - localTime) / scenario.duration) * 100;

  const activePersona = serverPersona || DEFAULT_PERSONA;
  const PersonaAvatar = activePersona.gender === 'female' ? FemaleAvatar : MaleAvatar;

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
                {/* Progress ring */}
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                  <circle
                    cx="20"
                    cy="20"
                    r="17"
                    fill="none"
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth="2.5"
                  />
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
                {formatTime(localTime)}
              </span>
            </div>
          )}

          {/* Right: Scenario pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200">
            <span className="text-xs text-gray-600">
              {scenario.category} · {scenario.type}
            </span>
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
                    {scenario.type}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{activePersona.emotionalState}</p>
              </div>
            </div>
          </GlassCard>

          {/* Transcript Area */}
          <GlassCard
            hover={false}
            className="flex-1 p-4 overflow-y-auto min-h-[300px] max-h-[calc(100vh-320px)]"
          >
            {status === 'idle' || status === 'connecting' ? (
              /* Empty / Pre-start state */
              <div className="h-full flex flex-col items-center justify-center gap-4">
                {status === 'idle' ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-[#eef0f6] border border-gray-200 flex items-center justify-center">
                      <Phone size={28} className="text-[#464e7e]" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-900 font-medium mb-1">Ready to begin?</p>
                      <p className="text-xs text-gray-500 max-w-xs">
                        You'll be connected with {activePersona.name} for a {formatTime(scenario.duration)} training session.
                      </p>
                    </div>
                    <button
                      onClick={handleStart}
                      className="mt-2 px-6 py-3 rounded-xl bg-[#464e7e] text-sm font-semibold text-white shadow-lg shadow-[#464e7e]/20 transition hover:brightness-110 active:scale-[0.97]"
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
              /* Active transcript */
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
                    <div
                      key={i}
                      className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}
                    >
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
                            <span className="text-[10px] text-gray-300 ml-auto">
                              {msg.timestamp}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">
                          {msg.text}
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-4 bg-[#464e7e]/60 ml-0.5 animate-pulse rounded-sm" />
                          )}
                        </p>
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
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'active' ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]' : 'bg-red-400'
                }`}
              />
              <span className="text-xs text-gray-500">{statusText}</span>
              {/* Simple audio level indicator */}
              <div className="flex items-end gap-[2px] ml-auto h-3">
                {[0.4, 0.7, 1, 0.6, 0.3].map((h, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-[#464e7e]/40"
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
            {/* Mic Button */}
            <button
              onClick={toggleMute}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                isMuted
                  ? 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/30'
                  : 'bg-[#464e7e] shadow-lg shadow-[#464e7e]/25 hover:brightness-110'
              }`}
            >
              {isMuted ? (
                <MicOff size={24} className="text-red-400" />
              ) : (
                <Mic size={24} className="text-white" />
              )}
            </button>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all duration-200"
            >
              <PhoneOff size={20} className="text-red-400" />
            </button>
          </div>
        </div>
      )}

      {/* ── Processing / Complete Overlay ─────────────────── */}
      {(status === 'processing' || status === 'complete') && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center">
          {status === 'processing' ? (
            <GlassCard hover={false} className="p-8 text-center max-w-sm">
              <div className="w-14 h-14 rounded-full border-[2.5px] border-[#464e7e]/20 border-t-[#464e7e] animate-spin mx-auto mb-5" />
              <h2 className="text-lg font-semibold text-gray-900 mb-1.5">
                Evaluating your performance...
              </h2>
              <p className="text-xs text-gray-500">
                Analyzing empathy, compliance, and information gathering
              </p>
            </GlassCard>
          ) : (
            <GlassCard hover={false} className="p-8 max-w-md w-full">
              <div className="text-center mb-6">
                {/* Score ring */}
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      fill="none"
                      stroke="rgba(0,0,0,0.06)"
                      strokeWidth="5"
                    />
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
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  {result?.summary}
                </p>
              </div>

              {/* Skill bars */}
              {result?.scores && (
                <div className="space-y-3 mb-6">
                  {Object.entries(result.scores).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-gray-500 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-[#464e7e]"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-900 w-7 text-right">
                        {value}
                      </span>
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

      {/* ── Error Overlay ─────────────────────────────────── */}
      {status === 'error' && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-md flex items-center justify-center">
          <GlassCard hover={false} className="p-8 text-center max-w-sm">
            <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1.5">Connection Error</h2>
            <p className="text-xs text-gray-500 mb-5">
              Unable to connect to the training session. This may be a network issue.
            </p>
            <button
              onClick={() => {
                disconnect();
                setStatus('idle');
              }}
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
