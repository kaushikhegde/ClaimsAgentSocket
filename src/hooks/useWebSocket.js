import { useRef, useState, useCallback, useEffect } from 'react';

export function useWebSocket({ onAudio, onGreetingDone, onTurnComplete } = {}) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(180);
  const [result, setResult] = useState(null);
  const [persona, setPersona] = useState(null);
  const statusRef = useRef('idle');

  // Keep refs for callbacks so they don't cause reconnects
  const onAudioRef = useRef(onAudio);
  const onGreetingDoneRef = useRef(onGreetingDone);
  const onTurnCompleteRef = useRef(onTurnComplete);
  useEffect(() => { onAudioRef.current = onAudio; }, [onAudio]);
  useEffect(() => { onGreetingDoneRef.current = onGreetingDone; }, [onGreetingDone]);
  useEffect(() => { onTurnCompleteRef.current = onTurnComplete; }, [onTurnComplete]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const connect = useCallback((scenarioId, mode = 'scripted', agentName = 'Sarah Kim') => {
    setStatus('connecting');
    setTranscript([]);
    setResult(null);
    setPersona(null);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start_session', scenarioId, mode, agentName }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ready':
            setStatus('active');
            break;

          case 'persona_selected':
            setPersona(msg.persona);
            break;

          case 'audio':
            onAudioRef.current?.(msg.data);
            break;

          case 'greeting_done':
            onGreetingDoneRef.current?.();
            break;

          case 'transcript_delta':
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === msg.role && last.streaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + msg.text },
                ];
              }
              return [
                ...prev,
                { role: msg.role, text: msg.text, timestamp: msg.timestamp, streaming: true },
              ];
            });
            break;

          case 'transcript_replace':
            // Replace last agent message with translated English text
            setTranscript((prev) => {
              const lastIdx = [...prev].reverse().findIndex((m) => m.role === msg.role);
              if (lastIdx === -1) return prev;
              const idx = prev.length - 1 - lastIdx;
              const updated = [...prev];
              updated[idx] = { ...updated[idx], text: msg.text };
              return updated;
            });
            break;

          case 'transcript_done':
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.streaming) {
                return [...prev.slice(0, -1), { ...last, streaming: false }];
              }
              return prev;
            });
            break;

          case 'turn_complete':
            onTurnCompleteRef.current?.();
            break;

          case 'time_warning':
            setTimeRemaining(msg.remainingSeconds || 30);
            break;

          case 'processing':
            setStatus('processing');
            break;

          case 'result':
            if (msg.status === 'success' && msg.data) {
              setResult(msg.data);
              setStatus('complete');
            } else {
              // Evaluation failed — show error
              console.error('Evaluation failed:', msg.message);
              setStatus('error');
            }
            break;

          case 'error':
            console.error('Session error:', msg.message);
            setStatus('error');
            break;

          case 'session_end':
            if (statusRef.current !== 'complete' && statusRef.current !== 'processing') {
              setStatus('processing');
            }
            break;

          case 'conversation_ended':
            // Auto end after a short delay
            setTimeout(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'end_session' }));
              }
            }, 1000);
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onerror = () => {
      if (statusRef.current === 'connecting') setStatus('error');
    };
    ws.onclose = () => {
      if (statusRef.current === 'connecting') setStatus('error');
    };
  }, []);

  const endSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }));
    }
    setStatus('processing');
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    status,
    setStatus,
    transcript,
    timeRemaining,
    setTimeRemaining,
    result,
    setResult,
    persona,
    connect,
    endSession,
    disconnect,
    wsRef,
  };
}
