import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Search, X, Plus, Check, Lock, Volume2 } from 'lucide-react';
import { apiFetch } from '../api';

const GENDERS = [['', 'Any gender'], ['female', 'Female'], ['male', 'Male']];
const ACCENTS = [['', 'Any accent'], ['australian', 'Australian'], ['british', 'British'], ['american', 'American']];

/** One shared <audio> so only one preview plays at a time. Previews are free (no credits). */
function usePreviewPlayer() {
  const audioRef = useRef(null);
  const [playingUrl, setPlayingUrl] = useState(null);
  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => setPlayingUrl(null);
    audio.onerror = () => setPlayingUrl(null);
    audioRef.current = audio;
    return () => { audio.pause(); audioRef.current = null; };
  }, []);
  const toggle = useCallback((url) => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playingUrl === url) { audio.pause(); setPlayingUrl(null); return; }
    audio.src = url;
    audio.play().then(() => setPlayingUrl(url)).catch(() => setPlayingUrl(null));
  }, [playingUrl]);
  return { playingUrl, toggle };
}

function Chip({ children }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 capitalize">{children}</span>;
}

function VoiceRow({ voice, selected, playing, onPlay, onSelect, onAdd, adding, canAdd, tier }) {
  const locked = voice.publicUserId && !voice.isAdded && tier === 'free' && !voice.freeUsersAllowed;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${selected ? 'border-[#464e7e]/40 bg-[#eef0f6]' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <button
        type="button"
        onClick={() => onPlay(voice.previewUrl)}
        disabled={!voice.previewUrl}
        aria-label={playing ? 'Pause preview' : 'Play preview'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${playing ? 'bg-[#464e7e] text-white' : 'bg-gray-100 text-[#464e7e] hover:bg-[#eef0f6]'} disabled:opacity-40`}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{voice.name}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {voice.labels.accent && <Chip>{voice.labels.accent}</Chip>}
          {voice.labels.gender && <Chip>{voice.labels.gender}</Chip>}
          {voice.labels.age && <Chip>{String(voice.labels.age).replace(/[_-]/g, ' ')}</Chip>}
          {voice.labels.useCase && <Chip>{String(voice.labels.useCase).replace(/_/g, ' ')}</Chip>}
        </div>
      </div>
      {voice.publicUserId && !voice.isAdded ? (
        locked ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400" title="Not available on the Free plan"><Lock size={12} /> Paid plans</span>
        ) : (
          <button type="button" onClick={() => onAdd(voice)} disabled={!canAdd || adding} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40" title={canAdd ? 'Add to my voices' : 'All voice slots are used'}>
            <Plus size={13} /> {adding ? 'Adding…' : 'Add'}
          </button>
        )
      ) : (
        <button type="button" onClick={() => onSelect(voice)} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${selected ? 'bg-[#464e7e] text-white' : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-[#eef0f6]'}`}>
          {selected ? <Check size={13} /> : null} {selected ? 'Selected' : 'Select'}
        </button>
      )}
    </div>
  );
}

export default function VoicePicker({ open, onClose, onSelect, selectedVoiceId, usage, onUsageChange }) {
  const [tab, setTab] = useState('mine');
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState('');
  const [accent, setAccent] = useState('australian');
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState(null);
  const { playingUrl, toggle } = usePreviewPlayer();

  const canAdd = !usage || !usage.voiceSlotsLimit || usage.voiceSlotsUsed < usage.voiceSlotsLimit;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ search, gender, accent }).toString();
      if (tab === 'mine') setVoices(await apiFetch(`/api/voices?${q}`));
      else setVoices((await apiFetch(`/api/voices/library?${q}`)).voices);
    } catch (err) {
      setError(err.message); setVoices([]);
    } finally { setLoading(false); }
  }, [tab, search, gender, accent]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(load, 250); // debounce typing
    return () => clearTimeout(t);
  }, [open, load]);

  const handleAdd = async (voice) => {
    setAddingId(voice.voiceId); setError('');
    try {
      const out = await apiFetch('/api/voices/library/add', { method: 'POST', body: { publicUserId: voice.publicUserId, voiceId: voice.voiceId, name: voice.name } });
      onUsageChange?.(out.usage);
      onSelect({ voiceId: out.voiceId, name: voice.name, labels: voice.labels });
    } catch (err) { setError(err.message); }
    finally { setAddingId(null); }
  };

  const slotsText = useMemo(() => (usage && usage.voiceSlotsLimit ? `${usage.voiceSlotsUsed} / ${usage.voiceSlotsLimit} voice slots used` : ''), [usage]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2"><Volume2 size={16} className="text-[#464e7e]" /><h2 className="text-base font-semibold text-gray-900">Choose a voice</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-5 pt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-0.5 inline-flex gap-0.5">
            {[['mine', 'My voices'], ['library', 'Voice library']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-[#464e7e]" />
            </div>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-2 py-2 bg-white">{GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select value={accent} onChange={(e) => setAccent(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-2 py-2 bg-white">{ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          {tab === 'library' && slotsText && <p className="text-[11px] text-gray-400">{slotsText}. Library voices must be added to your account before they can be used.</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="px-5 py-4 space-y-2 overflow-y-auto flex-1">
          {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading voices…</p>}
          {!loading && voices.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No voices match.</p>}
          {!loading && voices.map((v) => (
            <VoiceRow key={v.voiceId} voice={v} selected={v.voiceId === selectedVoiceId} playing={playingUrl === v.previewUrl} onPlay={toggle}
              onSelect={(voice) => onSelect({ voiceId: voice.voiceId, name: voice.name, labels: voice.labels })}
              onAdd={handleAdd} adding={addingId === v.voiceId} canAdd={canAdd} tier={usage?.tier} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Inline form field: shows the chosen voice and opens the picker. */
export function VoiceField({ label, value, onChange, placeholder = 'Choose a voice', usage, onUsageChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 min-h-[38px] flex items-center">
          {value?.voiceName || <span className="text-gray-400">{placeholder}</span>}
        </div>
        <button type="button" onClick={() => setOpen(true)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 hover:bg-[#eef0f6]">Browse</button>
        {value?.voiceId && <button type="button" onClick={() => onChange({ voiceId: null, voiceName: null })} className="text-xs text-gray-400 hover:text-gray-700">Clear</button>}
      </div>
      <VoicePicker open={open} onClose={() => setOpen(false)} selectedVoiceId={value?.voiceId} usage={usage} onUsageChange={onUsageChange}
        onSelect={(v) => { onChange({ voiceId: v.voiceId, voiceName: v.name }); setOpen(false); }} />
    </div>
  );
}
