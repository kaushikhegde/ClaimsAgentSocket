import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { apiFetch } from '../api';

const formatElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Drives one training call end-to-end: token from our backend → WebRTC session
 * with ElevenLabs → live transcript → completion + evaluation via our backend.
 * Must be used inside <ConversationProvider>.
 */
export function useTrainingCall() {
  const [phase, setPhase] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [persona, setPersona] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(180);

  const phaseRef = useRef('idle');
  const conversationIdRef = useRef(null);
  const startedAtRef = useRef(null);
  const completingRef = useRef(false);
  const timerRef = useRef(null);
  const conversationRef = useRef(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const complete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    stopTimer();
    setPhase('processing');
    try {
      const out = await apiFetch('/api/training/complete', { method: 'POST', body: { conversationId: conversationIdRef.current } });
      if (out.status === 'success') { setResult(out.data); setPhase('complete'); }
      else if (out.status === 'empty') { setPhase('empty'); }
      else { setErrorMessage(out.message || 'Evaluation failed'); setPhase('error'); }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to complete the session');
      setPhase('error');
    }
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      if (conversationId) conversationIdRef.current = conversationId;
      startedAtRef.current = Date.now();
      setPhase('active');
    },
    onMessage: ({ message, role, source }) => {
      const elapsed = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
      const isTrainee = role ? role === 'user' : source === 'user';
      setTranscript((prev) => [...prev, { role: isTrainee ? 'agent' : 'customer', text: message, timestamp: formatElapsed(elapsed) }]);
    },
    onDisconnect: (details) => {
      if (phaseRef.current === 'active' || phaseRef.current === 'connecting') {
        if (details && details.reason === 'error' && phaseRef.current === 'connecting') {
          setErrorMessage(details.message || 'Connection failed');
          setPhase('error');
          return;
        }
        complete();
      }
    },
    onError: (message) => {
      if (phaseRef.current === 'connecting') {
        setErrorMessage(typeof message === 'string' ? message : 'Connection failed');
        setPhase('error');
      }
    },
  });
  conversationRef.current = conversation;

  const start = useCallback(async (scenarioId, mode, agentName) => {
    completingRef.current = false;
    conversationIdRef.current = null;
    setTranscript([]);
    setResult(null);
    setErrorMessage('');
    setPhase('connecting');
    try {
      const session = await apiFetch('/api/training/start', { method: 'POST', body: { scenarioId, mode, agentName } });
      setScenario(session.scenario);
      setPersona(session.persona);
      setTimeRemaining(session.scenario.maxDurationSeconds);
      conversationIdRef.current = session.conversationId;
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error('Microphone access denied. Please allow microphone access and try again.');
      }
      conversationRef.current.startSession({
        conversationToken: session.conversationToken,
        connectionType: 'webrtc',
        dynamicVariables: session.dynamicVariables,
        overrides: session.voiceId ? { tts: { voiceId: session.voiceId } } : undefined,
      });
    } catch (err) {
      setErrorMessage(err.message || 'Failed to start the session');
      setPhase('error');
    }
  }, []);

  const end = useCallback(() => {
    stopTimer();
    try { conversationRef.current.endSession(); } catch { /* already closed */ }
    // onDisconnect → complete(); if the SDK doesn't fire it, complete anyway.
    setTimeout(() => { if (!completingRef.current) complete(); }, 1500);
  }, [complete]);

  const reset = useCallback(() => {
    stopTimer();
    completingRef.current = false;
    setPhase('idle');
    setTranscript([]);
    setResult(null);
    setErrorMessage('');
  }, []);

  // Countdown while active; the agent also enforces max duration server-side.
  useEffect(() => {
    if (phase !== 'active') return undefined;
    timerRef.current = setInterval(() => {
      setTimeRemaining((t) => {
        if (t <= 1) { end(); return 0; }
        return t - 1;
      });
    }, 1000);
    return stopTimer;
  }, [phase, end]);

  useEffect(() => () => { stopTimer(); try { conversationRef.current?.endSession(); } catch { /* noop */ } }, []);

  return {
    phase, transcript, scenario, persona, result, errorMessage, timeRemaining,
    mode: conversation.mode, isMuted: conversation.isMuted, setMuted: conversation.setMuted,
    start, end, reset,
  };
}
