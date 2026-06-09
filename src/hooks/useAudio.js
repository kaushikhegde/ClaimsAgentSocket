import { useRef, useState, useCallback } from 'react';

export function useAudio(wsRef) {
  const [isMuted, setIsMuted] = useState(true);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const playbackContextRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const unmuteTimerRef = useRef(null);
  const isMutedRef = useRef(true);
  const sessionActiveRef = useRef(false);

  // Step 1: Get mic permission
  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;
      sessionActiveRef.current = true;
      return true;
    } catch (err) {
      console.error('Mic access denied:', err);
      return false;
    }
  }, []);

  // Step 2: Start sending audio (called after greeting completes)
  const startProcessing = useCallback(() => {
    if (!mediaStreamRef.current) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const nativeSampleRate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(mediaStreamRef.current);
    const bufferSize = nativeSampleRate <= 16000 ? 2048 : 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isMutedRef.current || !sessionActiveRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const targetRate = 16000;
      const ratio = nativeSampleRate / targetRate;
      const targetLength = Math.floor(inputData.length / ratio);
      const int16 = new Int16Array(targetLength);

      for (let i = 0; i < targetLength; i++) {
        const srcIndex = i * ratio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, inputData.length - 1);
        const frac = srcIndex - srcFloor;
        const sample = inputData[srcFloor] * (1 - frac) + inputData[srcCeil] * frac;
        int16[i] = Math.max(-0x8000, Math.min(0x7FFF, Math.round(sample * 0x8000)));
      }

      const bytes = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      wsRef.current.send(JSON.stringify({ type: 'audio', data: btoa(binary) }));
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    // Unmute — start sending
    isMutedRef.current = false;
    setIsMuted(false);
  }, [wsRef]);

  // Play audio received from Gemini (24kHz PCM base64)
  const playAudio = useCallback((base64Data) => {
    try {
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioContext();
        nextPlayTimeRef.current = 0;
      }

      const ctx = playbackContextRef.current;
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const validLength = bytes.length - (bytes.length % 2);
      if (validLength === 0) return;

      const int16 = new Int16Array(bytes.buffer, 0, validLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 0x8000;
      }

      // Create buffer at 24kHz regardless of AudioContext's native rate
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const currentTime = ctx.currentTime;
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buffer.duration;
    } catch (err) {
      console.error('Failed to play audio chunk:', err);
    }
  }, []);

  // Mute mic while Gemini speaks (prevents echo)
  const muteForPlayback = useCallback(() => {
    isMutedRef.current = true;
    setIsMuted(true);
    nextPlayTimeRef.current = 0;
    if (unmuteTimerRef.current) {
      clearTimeout(unmuteTimerRef.current);
      unmuteTimerRef.current = null;
    }
  }, []);

  // Unmute after Gemini finishes speaking (waits for audio queue to drain)
  const scheduleUnmute = useCallback(() => {
    let delay = 0;
    const ctx = playbackContextRef.current;
    if (ctx && ctx.state !== 'closed') {
      delay = Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000 + 100);
    }
    unmuteTimerRef.current = setTimeout(() => {
      isMutedRef.current = false;
      setIsMuted(false);
      nextPlayTimeRef.current = 0;
      unmuteTimerRef.current = null;
    }, delay);
  }, []);

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    setIsMuted(isMutedRef.current);
  }, []);

  const stopCapture = useCallback(() => {
    sessionActiveRef.current = false;
    if (unmuteTimerRef.current) {
      clearTimeout(unmuteTimerRef.current);
      unmuteTimerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    isMutedRef.current = true;
    setIsMuted(true);
  }, []);

  return {
    isMuted,
    startCapture,
    startProcessing,
    stopCapture,
    toggleMute,
    playAudio,
    muteForPlayback,
    scheduleUnmute,
  };
}
