import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Upload, RefreshCw, CheckCircle2, AlertTriangle, Loader2, FileText } from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import UsageBadge from '../../components/UsageBadge';
import { useUsage, formatBytes } from '../../hooks/useUsage';
import { VoiceField } from '../../components/VoicePicker';
import { apiFetch } from '../../api';

const CLAIM_TYPES = [
  ['workplace_injury', 'Workplace injury'], ['auto_accident', 'Auto accident'], ['slip_and_fall', 'Slip and fall'],
  ['medical_malpractice', 'Medical malpractice'], ['property_damage', 'Property damage'], ['general_injury', 'General injury'],
];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const DEFAULT_OPENING = 'Hi… yeah, I need to file a claim. I got hurt at work.';

const emptyPersona = () => ({ key: Math.random().toString(36).slice(2), name: '', gender: 'male', emotionalState: '', backstory: '', openingLine: DEFAULT_OPENING, voiceId: null, voiceName: null });
const emptyScenario = () => ({ id: '', name: '', description: '', claimType: 'workplace_injury', difficulty: 'beginner', maxDurationSeconds: 180, defaultVoiceId: null, defaultVoiceName: null, personas: [emptyPersona()] });

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

const INDEX_CHIP = {
  indexing: ['Indexing…', 'bg-amber-400/10 text-amber-500', Loader2],
  pending: ['Pending', 'bg-gray-100 text-gray-500', Loader2],
  ready: ['Ready', 'bg-green-400/10 text-green-500', CheckCircle2],
  too_large: ['Too large to index — used as full context', 'bg-amber-400/10 text-amber-500', AlertTriangle],
  failed: ['Indexing failed', 'bg-red-400/10 text-red-400', AlertTriangle],
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:border-[#464e7e]';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function ScenarioEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { usage, refresh: refreshUsage } = useUsage();

  const [form, setForm] = useState(emptyScenario());
  const [documents, setDocuments] = useState([]);
  const [sync, setSync] = useState(null); // { elAgentId, elSyncedAt, elSyncError }
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);

  const applyScenario = useCallback((s) => {
    setForm({
      id: s.id, name: s.name, description: s.description || '', claimType: s.claimType, difficulty: s.difficulty,
      maxDurationSeconds: s.maxDurationSeconds, defaultVoiceId: s.defaultVoiceId, defaultVoiceName: s.defaultVoiceName,
      personas: s.personas.map((p) => ({ key: p.id, ...p })),
    });
    setDocuments(s.documents || []);
    setSync({ elAgentId: s.elAgentId, elSyncedAt: s.elSyncedAt, elSyncError: s.sync ? s.sync.error : s.elSyncError });
  }, []);

  useEffect(() => {
    if (isNew) return;
    apiFetch(`/api/scenarios/${id}`).then(applyScenario).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id, isNew, applyScenario]);

  // Poll while any document is still indexing.
  const indexing = documents.some((d) => d.indexStatus === 'indexing' || d.indexStatus === 'pending');
  useEffect(() => {
    if (isNew || !indexing) return undefined;
    const t = setInterval(() => {
      apiFetch(`/api/scenarios/${id}`).then((s) => setDocuments(s.documents || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [indexing, id, isNew]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setPersona = (key, patch) => setForm((f) => ({ ...f, personas: f.personas.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const movePersona = (idx, dir) => setForm((f) => {
    const arr = [...f.personas]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return f;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    return { ...f, personas: arr };
  });

  const handleSave = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const body = {
        ...form,
        maxDurationSeconds: Number(form.maxDurationSeconds),
        personas: form.personas.map((p) => {
          const { key: _key, id: pid, scenarioId: _sid, sortOrder: _so, ...rest } = p;
          return pid && !isNew ? { id: pid, ...rest } : rest;
        }),
      };
      const saved = isNew
        ? await apiFetch('/api/scenarios', { method: 'POST', body })
        : await apiFetch(`/api/scenarios/${id}`, { method: 'PUT', body });
      applyScenario(saved);
      setNotice(saved.sync?.ok ? 'Saved and synced to ElevenLabs.' : 'Saved. ElevenLabs sync failed — see below.');
      if (isNew) navigate(`/admin/scenarios/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e.data?.field ? `${e.message} (${e.data.field})` : e.message);
    } finally { setSaving(false); }
  };

  const handleResync = async () => {
    setSaving(true); setError('');
    try { applyScenario(await apiFetch(`/api/scenarios/${id}/sync`, { method: 'POST' })); setNotice('Sync attempted.'); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${form.name}"? Past sessions keep their history; the ElevenLabs agent and documents are removed.`)) return;
    try { await apiFetch(`/api/scenarios/${id}`, { method: 'DELETE' }); navigate('/admin/scenarios'); }
    catch (e) { setError(e.message); }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const doc = await apiFetch(`/api/scenarios/${id}/documents`, { method: 'POST', body: fd });
      setDocuments((d) => [...d, doc]);
      refreshUsage();
    } catch (e) { setError(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleRemoveDoc = async (doc) => {
    if (!window.confirm(`Remove "${doc.name}" from this scenario?`)) return;
    try { await apiFetch(`/api/scenarios/${id}/documents/${doc.id}`, { method: 'DELETE' }); setDocuments((d) => d.filter((x) => x.id !== doc.id)); }
    catch (e) { setError(e.message); }
  };

  const ragUsed = documents.reduce((n, d) => n + (d.indexStatus === 'ready' || d.indexStatus === 'indexing' ? d.sizeBytes : 0), 0);

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/admin/scenarios" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"><ArrowLeft size={12} /> Scenario Builder</Link>
          <h1 className="text-[22px] font-bold text-gray-900 mt-1">{isNew ? 'New scenario' : form.name}</h1>
        </div>
        <UsageBadge usage={usage} />
      </div>

      {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}
      {notice && <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">{notice}</div>}

      <GlassCard hover={false} className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set(isNew ? { name: e.target.value, id: slugify(e.target.value) } : { name: e.target.value })} /></Field>
          <Field label="Id (slug)" hint={isNew ? 'Lowercase letters, digits and dashes. Cannot change later.' : 'Fixed once created.'}>
            <input className={`${inputCls} ${!isNew ? 'bg-gray-50 text-gray-400' : ''}`} value={form.id} disabled={!isNew} onChange={(e) => set({ id: slugify(e.target.value) })} />
          </Field>
        </div>
        <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Claim type">
            <select className={inputCls} value={form.claimType} onChange={(e) => set({ claimType: e.target.value })}>{CLAIM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
          <Field label="Difficulty">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-0.5 flex gap-0.5">
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" onClick={() => set({ difficulty: d })} className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md capitalize ${form.difficulty === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Max duration (minutes)">
            <input type="number" min={1} max={15} className={inputCls} value={Math.round(form.maxDurationSeconds / 60)} onChange={(e) => set({ maxDurationSeconds: Math.max(60, Math.min(900, Number(e.target.value) * 60)) })} />
          </Field>
        </div>
        <VoiceField label="Default voice" value={{ voiceId: form.defaultVoiceId, voiceName: form.defaultVoiceName }} onChange={(v) => set({ defaultVoiceId: v.voiceId, defaultVoiceName: v.voiceName })} usage={usage} onUsageChange={refreshUsage} placeholder="Auto-pick an Australian voice" />
      </GlassCard>

      <GlassCard hover={false} className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Personas <span className="text-gray-400 font-normal">({form.personas.length}/10)</span></h2>
          <button type="button" disabled={form.personas.length >= 10} onClick={() => set({ personas: [...form.personas, emptyPersona()] })} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Plus size={13} /> Add persona</button>
        </div>
        {form.personas.map((p, idx) => (
          <div key={p.key} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Persona {idx + 1}</p>
              <div className="flex items-center gap-2 text-gray-400">
                <button type="button" onClick={() => movePersona(idx, -1)} aria-label="Move up" className="hover:text-gray-700"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => movePersona(idx, 1)} aria-label="Move down" className="hover:text-gray-700"><ArrowDown size={14} /></button>
                <button type="button" disabled={form.personas.length <= 1} onClick={() => set({ personas: form.personas.filter((x) => x.key !== p.key) })} aria-label="Remove" className="hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Name"><input className={inputCls} value={p.name} onChange={(e) => setPersona(p.key, { name: e.target.value })} /></Field>
              <Field label="Gender">
                <select className={inputCls} value={p.gender} onChange={(e) => setPersona(p.key, { gender: e.target.value })}><option value="male">Male</option><option value="female">Female</option></select>
              </Field>
              <Field label="Emotional state"><input className={inputCls} value={p.emotionalState} onChange={(e) => setPersona(p.key, { emotionalState: e.target.value })} placeholder="e.g. distressed, worried about finances" /></Field>
            </div>
            <Field label="Backstory" hint="Everything the customer knows: incident, injuries, doctor, policy number, witnesses."><textarea className={inputCls} rows={4} value={p.backstory} onChange={(e) => setPersona(p.key, { backstory: e.target.value })} /></Field>
            <Field label="Opening line" hint="What the customer says when the call is answered."><input className={inputCls} value={p.openingLine || ''} onChange={(e) => setPersona(p.key, { openingLine: e.target.value })} /></Field>
            <VoiceField label="Voice (optional)" value={{ voiceId: p.voiceId, voiceName: p.voiceName }} onChange={(v) => setPersona(p.key, { voiceId: v.voiceId, voiceName: v.voiceName })} usage={usage} onUsageChange={refreshUsage} placeholder="Inherits the scenario default voice" />
          </div>
        ))}
      </GlassCard>

      <GlassCard hover={false} className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Documents <span className="text-gray-400 font-normal">({documents.length}/10)</span></h2>
          <div>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.html" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            <button type="button" disabled={isNew || uploading || documents.length >= 10} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Upload size={13} /> {uploading ? 'Uploading…' : 'Upload document'}</button>
          </div>
        </div>
        {isNew && <p className="text-xs text-gray-400">Save the scenario first, then upload documents.</p>}
        {usage && (
          <p className="text-[11px] text-gray-400">{formatBytes(ragUsed)} of {formatBytes(usage.ragLimitBytes)} indexable on the {usage.tier} plan. Larger files still work — they are given to the customer as full context instead of being indexed.</p>
        )}
        <div className="space-y-2">
          {documents.map((d) => {
            const [text, cls, Icon] = INDEX_CHIP[d.indexStatus] || INDEX_CHIP.pending;
            return (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200">
                <FileText size={16} className="text-[#464e7e] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate">{d.name}</p>
                  <p className="text-[11px] text-gray-400">{formatBytes(d.sizeBytes)}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}><Icon size={11} className={d.indexStatus === 'indexing' ? 'animate-spin' : ''} /> {text}</span>
                <button type="button" onClick={() => handleRemoveDoc(d)} aria-label="Remove document" className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            );
          })}
          {!isNew && documents.length === 0 && <p className="text-xs text-gray-400">No documents yet. Upload a medical certificate, incident report or policy the customer can refer to.</p>}
        </div>
      </GlassCard>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs">
          {sync?.elAgentId && !sync?.elSyncError && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 size={13} /> Synced to ElevenLabs{sync.elSyncedAt ? ` · ${new Date(sync.elSyncedAt).toLocaleString()}` : ''}</span>}
          {sync?.elSyncError && (
            <span className="inline-flex items-center gap-2 text-red-500"><AlertTriangle size={13} /> Sync failed: {sync.elSyncError}
              <button type="button" onClick={handleResync} className="inline-flex items-center gap-1 text-[#464e7e] font-medium"><RefreshCw size={12} /> Retry</button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && <button type="button" onClick={handleDelete} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50">Delete</button>}
          <button type="button" disabled={saving} onClick={handleSave} className="px-5 py-2 rounded-xl bg-[#464e7e] text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">{saving ? 'Saving…' : isNew ? 'Create scenario' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
