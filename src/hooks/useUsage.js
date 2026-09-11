import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

/** ElevenLabs credits / voice slots / RAG limit for the current plan (cached 60 s server-side). */
export function useUsage() {
  const [usage, setUsage] = useState(null);
  const refresh = useCallback(() => {
    return apiFetch('/api/elevenlabs/usage').then(setUsage).catch(() => setUsage(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { usage, refresh };
}

export const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
