import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Upload, RefreshCw, CheckCircle2, AlertTriangle, Loader2, FileText,
  Undo2, CircleDashed, Eye, EyeOff, Copy, ChevronDown, ChevronRight, CircleAlert, Check, Play,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import UsageBadge from '../../components/UsageBadge';
import { useUsage, formatBytes } from '../../hooks/useUsage';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { VoiceField } from '../../components/VoicePicker';
import { apiFetch } from '../../api';
import { validateScenarioForm, normalizeServerField, LIMITS, INSURANCE_TYPES } from '../../scenarioValidation';
import { RUBRIC_WEIGHTS, LEGACY_WEIGHTS, scoreLabel } from '../../scoreLabels';
import { SCENARIO_TEMPLATES } from '../../scenarioTemplates';

// Values mirror CLAIM_TYPES in backend/src/training/scenarioValidation.js.
const CALL_TYPE_GROUPS = [
  ['Insurance', [
    ['workplace_injury', 'Workplace injury'], ['auto_accident', 'Auto accident'], ['slip_and_fall', 'Slip and fall'],
    ['medical_malpractice', 'Medical malpractice'], ['property_damage', 'Property damage'], ['general_injury', 'General injury'],
  ]],
  ['Services', [['crisis_support', 'Crisis support']]],
];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const DURATION_MINUTES = [3, 5, 7, 10, 15];
const DEFAULT_OPENING = 'Hi… yeah, I need to file a claim. I got hurt at work.';
const UNDO_MS = 10000;
const COLLAPSE_PERSONAS_ABOVE = 2;

// Section order on the page; nav, error summary and readiness all follow it.
const SECTIONS = [
  ['basics', 'Basics'], ['caller', 'Caller'], ['personas', 'Personas'], ['documents', 'Documents'],
  ['scoring', 'Scoring'], ['features', 'Training features'], ['advanced', 'Advanced'],
];
const REQUIRED_SECTIONS = new Set(['basics', 'personas']);

/** Which section a validation field path belongs to. */
function sectionOf(path) {
  if (path === 'id') return 'advanced';
  if (path.startsWith('personas')) return 'personas';
  if (path.startsWith('rubric')) return 'scoring';
  if (path.startsWith('features')) return 'features';
  return 'basics';
}
const SECTION_RANK = Object.fromEntries(SECTIONS.map(([key], i) => [key, i]));

// Hints and placeholders that depend on the call type.
const INSURANCE_COPY = {
  callContextHint: 'Who the caller is calling and why, and how they behave. Leave blank for the default insurance claim framing.',
  callContextPlaceholder: 'Leave blank: “a customer calling an insurer to file a claim”',
  emotionalPlaceholder: 'e.g. distressed, worried about finances',
  backstoryHint: 'Everything the customer knows: incident, injuries, doctor, policy number, witnesses.',
  openingPlaceholder: DEFAULT_OPENING,
  openingHint: 'What the customer says when the call is answered. Leave blank for the default line shown.',
  documentsEmpty: 'No documents yet. Upload a medical certificate, incident report or policy the customer can refer to.',
};
const COPY_BY_TYPE = {
  crisis_support: {
    callContextHint: 'Who the caller is calling and why, what they share with the other party, and how they react to the officer. Required for a realistic caller.',
    callContextPlaceholder: 'e.g. You are calling Services Australia after leaving a violent home…',
    emotionalPlaceholder: 'e.g. frightened, whispering, exhausted',
    backstoryHint: 'Everything the caller knows: what happened and when, shared records (payments, Medicare, nominees), children, what they fear. Include situational cues (whispering, interruptions, going quiet).',
    openingPlaceholder: 'e.g. Hi… sorry, I have to be quick. I need some help.',
    openingHint: 'What the caller says first when the call is answered.',
    documentsEmpty: 'No documents yet. Upload letters or records the caller might refer to, e.g. a Centrelink letter or an intervention order.',
  },
};
const copyFor = (claimType) => COPY_BY_TYPE[claimType] || INSURANCE_COPY;

const newUid = () => Math.random().toString(36).slice(2);
const emptyPersona = () => ({ key: newUid(), name: '', gender: 'male', emotionalState: '', backstory: '', situationalCues: '', openingLine: '', voiceId: null, voiceName: null });
const CUES_EXAMPLE = [
  'Speak quietly, in short bursts, as if you might be overheard.',
  'About a minute in, say "sorry — hang on", go completely silent for a few seconds, then continue more quietly.',
  'Open with a coded reason for calling (e.g. "it\'s about my phone bill") and only drop it if the officer asks whether you are safe to talk.',
  'If offered a safe callback, choose a specific time and number.',
].join('\n');
const emptyFeatures = () => ({ handoverNote: false, safetyActions: [], contentWarning: '', scriptedOnly: false });
const emptyScenario = () => ({ id: '', name: '', description: '', claimType: 'workplace_injury', difficulty: 'beginner', maxDurationSeconds: 180, defaultVoiceId: null, defaultVoiceName: null, callerContext: '', evaluatorRole: '', rubric: null, features: emptyFeatures(), personas: [emptyPersona()] });
const emptyAction = () => ({ uid: newUid(), key: '', label: '', kind: 'protect' });
const emptyRubricItem = () => ({ uid: newUid(), key: '', label: '', description: '', critical: false });
const withUids = (rubric) => (rubric ? { ...rubric, items: rubric.items.map((it) => ({ uid: it.key || newUid(), ...it })) } : null);

/** API scenario → editor form state. */
const toForm = (s) => ({
  id: s.id, name: s.name, description: s.description || '', claimType: s.claimType, difficulty: s.difficulty,
  maxDurationSeconds: s.maxDurationSeconds, defaultVoiceId: s.defaultVoiceId, defaultVoiceName: s.defaultVoiceName,
  callerContext: s.callerContext || '', evaluatorRole: s.evaluatorRole || '', rubric: withUids(s.rubric),
  features: {
    ...emptyFeatures(), ...(s.features || {}),
    contentWarning: s.features?.contentWarning || '',
    safetyActions: (s.features?.safetyActions || []).map((a) => ({ uid: a.key, ...a })),
  },
  personas: s.personas.map((p) => ({ key: p.id, ...p, situationalCues: p.situationalCues || '' })),
});

/** Template or duplicate source → fresh (unsaved) form state. */
const fromTemplate = (t) => ({
  ...emptyScenario(),
  ...t,
  id: slugify(t.name || ''),
  rubric: t.rubric ? { ...t.rubric, items: t.rubric.items.map((it) => ({ ...it, uid: newUid() })) } : null,
  features: { ...emptyFeatures(), ...(t.features || {}), safetyActions: (t.features?.safetyActions || []).map((a) => ({ ...a, uid: newUid() })) },
  personas: t.personas?.length ? t.personas.map((p) => ({ ...emptyPersona(), ...p, id: undefined, key: newUid() })) : [emptyPersona()],
});

/** Personas collapse by default once there are more than a couple. */
const initialCollapsed = (personas) => new Set(personas.length > COLLAPSE_PERSONAS_ABOVE ? personas.map((p) => p.key) : []);

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

const INDEX_CHIP = {
  indexing: ['Indexing…', 'bg-amber-400/10 text-amber-500', Loader2],
  pending: ['Pending', 'bg-gray-100 text-gray-500', Loader2],
  ready: ['Ready', 'bg-green-400/10 text-green-500', CheckCircle2],
  too_large: ['Too large to index — used as full context', 'bg-amber-400/10 text-amber-500', AlertTriangle],
  failed: ['Indexing failed', 'bg-red-400/10 text-red-400', AlertTriangle],
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:border-[#464e7e]';
const errorInputCls = 'w-full px-3 py-2 rounded-lg border border-red-300 bg-white text-sm text-gray-900 focus:outline-none focus:border-red-400';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
const inputClass = (error) => (error ? errorInputCls : inputCls);
const iconBtn = 'text-gray-400 hover:text-gray-700 disabled:opacity-30';

const PERSONA_FIELD_LABELS = { name: 'Name', emotionalState: 'Emotional state', backstory: 'Backstory', openingLine: 'Opening line', situationalCues: 'Situational cues' };

/** "Checklist 35% · Empathy 17% …" for the current scoring setup. */
function scoringSummary(form) {
  if (!form.rubric) {
    return Object.entries(LEGACY_WEIGHTS).map(([k, w]) => `${scoreLabel(k)} ${w}%`).join(' · ');
  }
  const fields = ['rubricCompliance', 'empathy', 'questionQuality', 'toneConsistency', 'talkListenRatio', 'fillerWords', 'responseTime'];
  if (form.features.handoverNote) fields.push('handoverCompleteness');
  if (form.features.safetyActions.some((a) => a.kind === 'protect')) fields.push('actionSequencing');
  const total = fields.reduce((n, f) => n + RUBRIC_WEIGHTS[f], 0);
  return fields.map((f) => `${f === 'rubricCompliance' ? 'Checklist' : scoreLabel(f)} ${Math.round((RUBRIC_WEIGHTS[f] / total) * 100)}%`).join(' · ');
}

/** Human label for a validation field path, used in the error summary. */
function fieldLabel(path, form) {
  const top = { id: 'Id', name: 'Name', maxDurationSeconds: 'Max duration', personas: 'Personas', 'rubric.items': 'Checklist items', 'features.safetyActions': 'Safety actions' };
  if (top[path]) return top[path];
  let m = path.match(/^personas\[(\d+)\]\.(\w+)$/);
  if (m) {
    const name = form.personas[Number(m[1])]?.name;
    return `Persona ${Number(m[1]) + 1}${name ? ` (${name})` : ''} · ${PERSONA_FIELD_LABELS[m[2]] || m[2]}`;
  }
  m = path.match(/^rubric\.items\[(\d+)\]\.(\w+)$/);
  if (m) return `Checklist item ${Number(m[1]) + 1} · ${m[2] === 'description' ? 'Description' : 'Label'}`;
  m = path.match(/^features\.safetyActions\[(\d+)\]\.\w+$/);
  if (m) return `Safety action ${Number(m[1]) + 1} · Label`;
  return path;
}

/** Non-blocking checks that affect how well the scenario works in a call. */
function readinessOf({ form, documents, sync, isNew, isDirty }) {
  const warnings = [];
  const positives = [];
  const insurance = INSURANCE_TYPES.includes(form.claimType);

  const voiceless = form.personas.filter((p) => !p.voiceId).length;
  if (!form.defaultVoiceId && voiceless > 0) {
    warnings.push({ section: 'basics', text: `${voiceless} persona${voiceless === 1 ? ' has' : 's have'} no voice and no default is set — an Australian voice will be auto-picked` });
  }
  if (!insurance && !form.callerContext.trim()) warnings.push({ section: 'caller', text: 'No call context — the caller falls back to insurance framing' });
  if (!insurance && !form.rubric) warnings.push({ section: 'scoring', text: 'No custom checklist — calls are scored on insurance criteria' });
  if (form.rubric && !form.rubric.items.some((it) => it.critical)) warnings.push({ section: 'scoring', text: 'Checklist has no critical items' });
  if (!insurance && !form.features.contentWarning.trim()) warnings.push({ section: 'features', text: 'No content warning for a sensitive call type' });
  if (form.rubric && form.features.safetyActions.length > 0 && !form.features.safetyActions.some((a) => a.kind === 'claim')) {
    warnings.push({ section: 'features', text: 'No “Opens claim” action — every protection will count as on time' });
  }
  const indexing = documents.filter((d) => d.indexStatus === 'indexing' || d.indexStatus === 'pending').length;
  if (indexing) warnings.push({ section: 'documents', text: `${indexing} document${indexing === 1 ? ' is' : 's are'} still indexing` });
  const failed = documents.filter((d) => d.indexStatus === 'failed').length;
  if (failed) warnings.push({ section: 'documents', text: `${failed} document${failed === 1 ? '' : 's'} failed to index` });
  if (!isNew && sync?.elSyncError) warnings.push({ section: null, text: 'ElevenLabs sync failed — trainees can’t start calls' });
  if (!isNew && !sync?.elSyncError && !sync?.elAgentId) warnings.push({ section: null, text: 'Not synced to ElevenLabs yet' });
  if (!isNew && isDirty) warnings.push({ section: null, text: 'Unsaved changes — trainees get the last saved version' });

  positives.push(`${form.personas.length} persona${form.personas.length === 1 ? '' : 's'}`);
  if (form.rubric) {
    const critical = form.rubric.items.filter((it) => it.critical).length;
    positives.push(`Checklist: ${form.rubric.items.length} item${form.rubric.items.length === 1 ? '' : 's'}, ${critical} critical`);
  }
  if (form.features.handoverNote) positives.push('Handover note on');
  if (form.features.safetyActions.length) positives.push(`${form.features.safetyActions.length} safety action${form.features.safetyActions.length === 1 ? '' : 's'}`);
  if (!isNew && sync?.elAgentId && !sync?.elSyncError) positives.push('Synced to ElevenLabs');
  return { warnings, positives };
}

/** Scrolls to and focuses the first field (in page order) that has an error. */
function focusFirstError(errors) {
  requestAnimationFrame(() => {
    const el = [...document.querySelectorAll('[data-field]')].find((n) => errors[n.dataset.field]);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.querySelector('input, textarea, select, button')?.focus({ preventScroll: true });
  });
}

const scrollToSection = (key) => document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/* ─── Small building blocks ──────────────────────────────────── */

function ErrorText({ children }) {
  return children ? <p className="text-xs text-red-500 mt-1">{children}</p> : null;
}

/**
 * Who can see a field. Trainee-visible data comes from toPublicScenario (backend/src/db/scenarios.js)
 * and startCall (backend/src/training/callFlow.js); keep these badges in sync with them.
 */
function Visibility({ hidden }) {
  return hidden ? (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-500 align-middle" title="Only the AI caller and evaluator use this; trainees never see it."><EyeOff size={10} /> Hidden · answer key</span>
  ) : (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-[#eef0f6] px-1.5 py-px text-[10px] font-medium text-[#464e7e] align-middle" title="Shown to trainees before or during the call."><Eye size={10} /> Trainees see</span>
  );
}

function Field({ label, children, hint, required, error, path, visibility, extra }) {
  const id = useId();
  // Link the label to native controls; composite children (voice picker, toggles) keep their own labelling.
  const child = Children.only(children);
  const linked = isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type)
    ? cloneElement(child, { id, 'aria-invalid': error ? true : undefined })
    : child;
  return (
    <div data-field={path}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={labelCls}>
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
          {visibility && <Visibility hidden={visibility === 'hidden'} />}
        </label>
        {extra}
      </div>
      {linked}
      {error ? <ErrorText>{error}</ErrorText> : hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ id, title, count, visibility, action, offset, children }) {
  return (
    <GlassCard hover={false} id={`section-${id}`} style={{ scrollMarginTop: offset }} className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {title}{count && <span className="text-gray-400 font-normal"> ({count})</span>}
          {visibility && <Visibility hidden={visibility === 'hidden'} />}
        </h2>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function RemovedRow({ label, onUndo }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">
      <span className="truncate">Removed “{label}”</span>
      <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 font-medium text-[#464e7e] hover:text-[#5a6396]"><Undo2 size={12} /> Undo</button>
    </div>
  );
}

function MoveButtons({ index, count, onMove, label }) {
  return (
    <>
      <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${label} up`} className={iconBtn}><ArrowUp size={14} /></button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${label} down`} className={iconBtn}><ArrowDown size={14} /></button>
    </>
  );
}

function SyncChip({ isNew, sync, saving, onRetry }) {
  if (isNew) return null;
  if (sync?.elSyncError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600" title={sync.elSyncError}>
        <AlertTriangle size={12} /> Sync failed
        <button type="button" disabled={saving} onClick={onRetry} className="inline-flex items-center gap-0.5 text-[#464e7e] disabled:opacity-50"><RefreshCw size={11} /> Retry</button>
      </span>
    );
  }
  if (sync?.elAgentId) {
    const when = sync.elSyncedAt ? new Date(sync.elSyncedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    return <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700"><CheckCircle2 size={12} /> Synced{when ? ` · ${when}` : ''}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500"><CircleDashed size={12} /> Not synced yet</span>;
}

/* ─── Right rail: section nav + readiness ────────────────────── */

function SectionStatus({ status }) {
  if (status === 'error') return <CircleAlert size={13} className="text-red-500" aria-label="Has errors" />;
  if (status === 'warning') return <AlertTriangle size={13} className="text-amber-500" aria-label="Has warnings" />;
  if (status === 'ok') return <Check size={13} className="text-green-500" aria-label="Complete" />;
  return null;
}

function SectionNav({ active, statuses, compact, onJump }) {
  if (compact) {
    return (
      <nav aria-label="Form sections" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => onJump(key)} className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${active === key ? 'border-[#464e7e]/30 bg-[#eef0f6] text-[#464e7e]' : 'border-gray-200 bg-white text-gray-500'}`}>
            {label} <SectionStatus status={statuses[key]} />
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Form sections" className="space-y-0.5">
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-gray-400 font-medium px-2 mb-1.5">Sections</p>
      {SECTIONS.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onJump(key)} aria-current={active === key ? 'true' : undefined}
          className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] ${active === key ? 'bg-[#eef0f6] text-[#464e7e] font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
          {label} <SectionStatus status={statuses[key]} />
        </button>
      ))}
    </nav>
  );
}

function TestCallPicker({ personas, disabled, onTest }) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(personas.length - 1, 0));
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-gray-400 font-medium px-2">Test call</p>
      <select aria-label="Persona to test" disabled={disabled} value={safeIndex} onChange={(e) => setIndex(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-800 disabled:opacity-50">
        {personas.map((p, i) => <option key={p.key} value={i}>{p.name.trim() || `Persona ${i + 1}`}</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={() => onTest(safeIndex)} title={disabled ? 'Create the scenario first' : 'Opens a test call with this persona in a new tab'}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#464e7e]/30 bg-[#eef0f6] px-2 py-1.5 text-[12px] font-medium text-[#464e7e] hover:bg-[#e3e6f0] disabled:opacity-50">
        <Play size={12} /> Test this persona
      </button>
      {disabled && <p className="px-2 text-[11px] text-gray-400">Create the scenario first.</p>}
    </div>
  );
}

function ReadinessPanel({ errorCount, warnings, positives, onShowErrors, onJump }) {
  return (
    <div className="space-y-2">
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-gray-400 font-medium px-2">Readiness</p>
      {errorCount > 0 && (
        <button type="button" onClick={onShowErrors} className="w-full flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-100">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {errorCount} field{errorCount === 1 ? '' : 's'} need{errorCount === 1 ? 's' : ''} fixing before saving
        </button>
      )}
      {warnings.map((w) => (
        <button key={w.text} type="button" disabled={!w.section} onClick={() => w.section && onJump(w.section)} className="w-full flex items-start gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] text-amber-700 enabled:hover:bg-amber-50 disabled:cursor-default">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" /> {w.text}
        </button>
      ))}
      {positives.map((p) => (
        <p key={p} className="flex items-start gap-1.5 px-2 text-[12px] text-gray-500"><Check size={13} className="mt-0.5 shrink-0 text-green-500" /> {p}</p>
      ))}
    </div>
  );
}

/* ─── Sections ───────────────────────────────────────────────── */

function TemplatePicker({ selected, onPick }) {
  return (
    <GlassCard hover={false} className="p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Start from</p>
      <div role="radiogroup" aria-label="Start from" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SCENARIO_TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={selected === t.id} onClick={() => onPick(t)}
            className={`text-left rounded-xl border px-3 py-2.5 transition ${selected === t.id ? 'border-[#464e7e]/40 bg-[#eef0f6]' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <p className="text-sm font-medium text-gray-900">{t.label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.description}</p>
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

function BasicsSection({ ed }) {
  const { form, errors, set, isNew, idTouched, usage, refreshUsage, durationOptions, onDifficultyKey, offset } = ed;
  return (
    <Section id="basics" title="Basics" offset={offset}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" required visibility="trainee" path="name" error={errors.name}>
          <input className={inputClass(errors.name)} maxLength={LIMITS.name} value={form.name} onChange={(e) => set(isNew && !idTouched ? { name: e.target.value, id: slugify(e.target.value) } : { name: e.target.value })} />
        </Field>
        <Field label="Call type" visibility="trainee" hint="Sets the caller framing, hints and default scoring.">
          <select className={inputCls} value={form.claimType} onChange={(e) => set({ claimType: e.target.value })}>
            {CALL_TYPE_GROUPS.map(([group, types]) => (
              <optgroup key={group} label={group}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description" visibility="trainee" hint="Shown on the scenario card before the trainee starts.">
        <textarea className={inputCls} rows={2} maxLength={LIMITS.description} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p id="difficulty-label" className={labelCls}>Difficulty<Visibility /></p>
          <div role="radiogroup" aria-labelledby="difficulty-label" onKeyDown={onDifficultyKey} className="bg-gray-50 border border-gray-200 rounded-lg p-0.5 flex gap-0.5">
            {DIFFICULTIES.map((d) => {
              const selected = form.difficulty === d;
              return (
                <button key={d} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-value={d} onClick={() => set({ difficulty: d })} className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md capitalize ${selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{d}</button>
              );
            })}
          </div>
        </div>
        <Field label="Max duration" visibility="trainee" path="maxDurationSeconds" error={errors.maxDurationSeconds}>
          <select className={inputClass(errors.maxDurationSeconds)} value={form.maxDurationSeconds} onChange={(e) => set({ maxDurationSeconds: Number(e.target.value) })}>
            {durationOptions.map((s) => <option key={s} value={s}>{s % 60 === 0 ? `${s / 60} minutes` : `${Math.round((s / 60) * 10) / 10} minutes`}</option>)}
          </select>
        </Field>
      </div>
      <VoiceField label="Default voice" value={{ voiceId: form.defaultVoiceId, voiceName: form.defaultVoiceName }} onChange={(v) => set({ defaultVoiceId: v.voiceId, defaultVoiceName: v.voiceName })} usage={usage} onUsageChange={refreshUsage} placeholder="Auto-pick an Australian voice" />
    </Section>
  );
}

function CallerSection({ ed }) {
  const { form, set, copy, offset } = ed;
  return (
    <Section id="caller" title="Caller" offset={offset}>
      <Field label="Call context" visibility="hidden" hint={copy.callContextHint}>
        <textarea className={inputCls} rows={4} maxLength={LIMITS.callerContext} value={form.callerContext} onChange={(e) => set({ callerContext: e.target.value })} placeholder={copy.callContextPlaceholder} />
      </Field>
    </Section>
  );
}

function PersonaCard({ ed, persona: p, index: idx }) {
  const { form, errors, copy, needsOpeningLine, usage, refreshUsage, setPersona, moveItem, removeItem, duplicatePersona, collapsed, toggleCollapsed, isNew, testPersona } = ed;
  const e = (field) => errors[`personas[${idx}].${field}`];
  const hasError = e('name') || e('emotionalState') || e('backstory') || e('openingLine') || e('situationalCues');
  const cuesLen = (p.situationalCues || '').length;
  // A card with an error always opens so the field can be focused.
  const open = !collapsed.has(p.key) || !!hasError;
  const displayName = p.name.trim() || `Persona ${idx + 1}`;
  const initials = p.name.trim() ? p.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
  const backstoryLen = p.backstory.length;
  const backstoryRows = Math.min(12, Math.max(4, Math.ceil(backstoryLen / 95) + (p.backstory.match(/\n/g) || []).length));
  return (
    <div className={`rounded-xl border ${hasError ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => toggleCollapsed(p.key)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${displayName}`} className="flex flex-1 min-w-0 items-center gap-3 text-left">
          {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
          <span className="w-8 h-8 rounded-full bg-[#eef0f6] text-[#464e7e] text-xs font-semibold flex items-center justify-center shrink-0">{initials}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900 truncate">{displayName}{hasError && <CircleAlert size={12} className="inline ml-1.5 text-red-500 align-[-1px]" />}</span>
            <span className="block text-[11px] text-gray-400 truncate">
              {p.emotionalState || 'No emotional state'} · {p.voiceName || (form.defaultVoiceName ? `Default voice (${form.defaultVoiceName})` : 'No voice')} · {backstoryLen.toLocaleString()} chars
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" disabled={isNew} onClick={() => testPersona(idx)} aria-label={`Test call with ${displayName}`} title={isNew ? 'Create the scenario first' : 'Test call with this persona (new tab)'} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#464e7e] hover:bg-[#eef0f6] disabled:opacity-40"><Play size={12} /> Test</button>
          <MoveButtons index={idx} count={form.personas.length} onMove={(i, dir) => moveItem('persona', i, dir)} label={displayName} />
          <button type="button" disabled={form.personas.length >= LIMITS.personas} onClick={() => duplicatePersona(idx)} aria-label={`Duplicate ${displayName}`} title="Duplicate" className={iconBtn}><Copy size={14} /></button>
          <button type="button" disabled={form.personas.length <= 1} onClick={() => removeItem('persona', idx, p.name)} aria-label={`Remove ${displayName}`} className="text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Name" required visibility="trainee" path={`personas[${idx}].name`} error={e('name')}>
              <input className={inputClass(e('name'))} maxLength={LIMITS.personaName} value={p.name} onChange={(ev) => setPersona(p.key, { name: ev.target.value })} />
            </Field>
            <Field label="Gender">
              <select className={inputCls} value={p.gender} onChange={(ev) => setPersona(p.key, { gender: ev.target.value })}><option value="male">Male</option><option value="female">Female</option></select>
            </Field>
            <Field label="Emotional state" required visibility="trainee" path={`personas[${idx}].emotionalState`} error={e('emotionalState')}>
              <input className={inputClass(e('emotionalState'))} maxLength={LIMITS.emotionalState} value={p.emotionalState} onChange={(ev) => setPersona(p.key, { emotionalState: ev.target.value })} placeholder={copy.emotionalPlaceholder} />
            </Field>
          </div>
          <Field label="Backstory" required visibility="hidden" path={`personas[${idx}].backstory`} error={e('backstory')} hint={copy.backstoryHint}
            extra={<span className={`text-[11px] tabular-nums ${backstoryLen >= LIMITS.backstory * 0.9 ? 'text-amber-600' : 'text-gray-400'}`}>{backstoryLen.toLocaleString()} / {LIMITS.backstory.toLocaleString()}</span>}>
            <textarea className={inputClass(e('backstory'))} rows={backstoryRows} maxLength={LIMITS.backstory} value={p.backstory} onChange={(ev) => setPersona(p.key, { backstory: ev.target.value })} />
          </Field>
          <Field label="Situational cues" visibility="hidden" path={`personas[${idx}].situationalCues`} error={e('situationalCues')}
            hint="Behaviour the caller acts out at specific moments: whispering, interruptions, going quiet, coded language."
            extra={(
              <span className="flex items-center gap-3">
                {!p.situationalCues?.trim() && (
                  <button type="button" onClick={() => setPersona(p.key, { situationalCues: CUES_EXAMPLE })} className="text-[11px] font-medium text-[#464e7e] hover:text-[#5a6396]">Insert example</button>
                )}
                <span className={`text-[11px] tabular-nums ${cuesLen >= LIMITS.situationalCues * 0.9 ? 'text-amber-600' : 'text-gray-400'}`}>{cuesLen.toLocaleString()} / {LIMITS.situationalCues.toLocaleString()}</span>
              </span>
            )}>
            <textarea className={inputClass(e('situationalCues'))} rows={3} maxLength={LIMITS.situationalCues} value={p.situationalCues || ''} onChange={(ev) => setPersona(p.key, { situationalCues: ev.target.value })} placeholder="Optional — e.g. about a minute in, say “hang on” and go silent until the officer checks on you." />
          </Field>
          <Field label="Opening line" required={needsOpeningLine} visibility="hidden" path={`personas[${idx}].openingLine`} error={e('openingLine')} hint={copy.openingHint}>
            <input className={inputClass(e('openingLine'))} maxLength={LIMITS.openingLine} value={p.openingLine || ''} onChange={(ev) => setPersona(p.key, { openingLine: ev.target.value })} placeholder={copy.openingPlaceholder} />
          </Field>
          <VoiceField label="Voice (optional)" value={{ voiceId: p.voiceId, voiceName: p.voiceName }} onChange={(v) => setPersona(p.key, { voiceId: v.voiceId, voiceName: v.voiceName })} usage={usage} onUsageChange={refreshUsage} placeholder="Inherits the scenario default voice" />
        </div>
      )}
    </div>
  );
}

function PersonasSection({ ed }) {
  const { form, errors, set, removedRows, collapsed, setAllCollapsed, offset } = ed;
  const allCollapsed = form.personas.every((p) => collapsed.has(p.key));
  return (
    <Section id="personas" title="Personas" count={`${form.personas.length}/${LIMITS.personas}`} offset={offset}
      action={(
        <div className="flex items-center gap-3" data-field="personas">
          {form.personas.length > 1 && (
            <button type="button" onClick={() => setAllCollapsed(!allCollapsed)} className="text-xs text-gray-500 hover:text-gray-800">{allCollapsed ? 'Expand all' : 'Collapse all'}</button>
          )}
          <button type="button" disabled={form.personas.length >= LIMITS.personas} onClick={() => set({ personas: [...form.personas, emptyPersona()] })} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Plus size={13} /> Add persona</button>
        </div>
      )}>
      <ErrorText>{errors.personas}</ErrorText>
      {form.personas.map((p, idx) => <PersonaCard key={p.key} ed={ed} persona={p} index={idx} />)}
      {removedRows('persona')}
    </Section>
  );
}

function DocumentsSection({ ed }) {
  const { isNew, documents, uploading, fileRef, handleUpload, handleRemoveDoc, usage, ragUsed, copy, offset } = ed;
  return (
    <Section id="documents" title="Documents" count={`${documents.length}/10`} visibility="hidden" offset={offset}
      action={(
        <div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.html" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
          <button type="button" disabled={isNew || uploading || documents.length >= 10} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Upload size={13} /> {uploading ? 'Uploading…' : 'Upload document'}</button>
        </div>
      )}>
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
        {!isNew && documents.length === 0 && <p className="text-xs text-gray-400">{copy.documentsEmpty}</p>}
      </div>
    </Section>
  );
}

function ScoringSection({ ed }) {
  const { form, errors, set, setRubricItem, moveItem, removeItem, removedRows, toggleRubric, rubricDraft, needsOpeningLine, offset } = ed;
  return (
    <Section id="scoring" title="Scoring" offset={offset}>
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.rubric} onChange={(e) => toggleRubric(e.target.checked)} />
          Use a custom scoring checklist <span className="text-xs text-gray-400">(off = insurance RTWASA + SOP scoring)</span>
          <Visibility hidden />
        </label>
        {!form.rubric && rubricDraft?.items?.length > 0 && (
          <p className="text-xs text-amber-600 mt-1 ml-6">
            Checklist off — {rubricDraft.items.length} item{rubricDraft.items.length === 1 ? '' : 's'} won’t be saved. Turn it back on to keep {rubricDraft.items.length === 1 ? 'it' : 'them'}.
          </p>
        )}
        {!form.rubric && needsOpeningLine && !rubricDraft?.items?.length && (
          <p className="text-xs text-amber-600 mt-1 ml-6">Recommended for this call type — without a checklist, calls are scored against insurance claim criteria.</p>
        )}
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        <span className="font-medium text-gray-500">Overall score weighting:</span> {scoringSummary(form)}
      </p>
      {form.rubric && (
        <div className="space-y-3">
          <Field label="Checklist title" hint="Shown as the heading of the checklist on the session review.">
            <input className={inputCls} maxLength={LIMITS.rubricTitle} value={form.rubric.title || ''} onChange={(e) => set({ rubric: { ...form.rubric, title: e.target.value } })} placeholder="e.g. FDV Crisis Triage Protocol" />
          </Field>
          <div className="flex items-center justify-between" data-field="rubric.items">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Checklist items ({form.rubric.items.length}/{LIMITS.rubricItems})</p>
            <button type="button" disabled={form.rubric.items.length >= LIMITS.rubricItems} onClick={() => set({ rubric: { ...form.rubric, items: [...form.rubric.items, emptyRubricItem()] } })} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Plus size={13} /> Add item</button>
          </div>
          <ErrorText>{errors['rubric.items']}</ErrorText>
          {form.rubric.items.map((it, idx) => {
            const labelError = errors[`rubric.items[${idx}].label`];
            const descError = errors[`rubric.items[${idx}].description`];
            return (
              <div key={it.uid} className={`rounded-xl border p-3 space-y-2 ${labelError || descError ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-5 pt-2.5">{idx + 1}.</span>
                  <div className="flex-1" data-field={`rubric.items[${idx}].label`}>
                    <input aria-label={`Checklist item ${idx + 1} label`} aria-invalid={labelError ? true : undefined} className={inputClass(labelError)} maxLength={LIMITS.itemLabel} value={it.label} onChange={(e) => setRubricItem(it.uid, { label: e.target.value })} placeholder="Label, e.g. Safety to speak *" />
                    <ErrorText>{labelError}</ErrorText>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0 pt-2.5"><input type="checkbox" checked={!!it.critical} onChange={(e) => setRubricItem(it.uid, { critical: e.target.checked })} /> Critical</label>
                  <div className="flex items-center gap-2 pt-2.5 shrink-0">
                    <MoveButtons index={idx} count={form.rubric.items.length} onMove={(i, dir) => moveItem('rubricItem', i, dir)} label={`checklist item ${idx + 1}`} />
                    <button type="button" disabled={form.rubric.items.length <= 1} onClick={() => removeItem('rubricItem', idx, it.label)} aria-label={`Remove checklist item ${idx + 1}`} className="text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div data-field={`rubric.items[${idx}].description`}>
                  <textarea aria-label={`Checklist item ${idx + 1} description`} aria-invalid={descError ? true : undefined} className={inputClass(descError)} rows={2} maxLength={LIMITS.itemDescription} value={it.description} onChange={(e) => setRubricItem(it.uid, { description: e.target.value })} placeholder="What a pass looks like — the evaluator marks pass / partial / fail / n/a against this. *" />
                  <ErrorText>{descError}</ErrorText>
                </div>
              </div>
            );
          })}
          {removedRows('rubricItem')}
        </div>
      )}
    </Section>
  );
}

function FeaturesSection({ ed }) {
  const { form, errors, setFeatures, setAction, moveItem, removeItem, removedRows, offset } = ed;
  return (
    <Section id="features" title="Training features" offset={offset}>
      <Field label="Content warning" visibility="trainee" hint="Shown before the call; the trainee must acknowledge it to start. Leave blank for none.">
        <textarea className={inputCls} rows={2} maxLength={LIMITS.contentWarning} value={form.features.contentWarning} onChange={(e) => setFeatures({ contentWarning: e.target.value })} placeholder="e.g. This scenario includes family and domestic violence…" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.features.scriptedOnly} onChange={(e) => setFeatures({ scriptedOnly: e.target.checked })} />
        Scripted mode only <span className="text-xs text-gray-400">(personas carry cues a freestyle caller won’t reproduce)</span>
      </label>
      {!form.rubric ? (
        <p className="text-xs text-gray-400">Turn on a custom scoring checklist to enable the handover note and the safety-actions panel.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.features.handoverNote} onChange={(e) => setFeatures({ handoverNote: e.target.checked })} />
            Post-call handover note <span className="text-xs text-gray-400">(scored for completeness against the call)</span>
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between" data-field="features.safetyActions">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Safety actions panel ({form.features.safetyActions.length}/{LIMITS.safetyActions})<Visibility /></p>
              <button type="button" disabled={form.features.safetyActions.length >= LIMITS.safetyActions} onClick={() => setFeatures({ safetyActions: [...form.features.safetyActions, emptyAction()] })} className="inline-flex items-center gap-1 text-xs font-medium text-[#464e7e] disabled:opacity-40"><Plus size={13} /> Add action</button>
            </div>
            <p className="text-[11px] text-gray-400">Buttons the trainee clicks during the call, in this order. Protective actions clicked before the first “opens claim” action score as on time.</p>
            <ErrorText>{errors['features.safetyActions']}</ErrorText>
            {form.features.safetyActions.map((a, idx) => {
              const labelError = errors[`features.safetyActions[${idx}].label`];
              return (
                <div key={a.uid} className="flex items-start gap-2" data-field={`features.safetyActions[${idx}].label`}>
                  <div className="flex-1">
                    <input aria-label={`Safety action ${idx + 1} label`} aria-invalid={labelError ? true : undefined} className={inputClass(labelError)} maxLength={LIMITS.actionLabel} value={a.label} onChange={(e) => setAction(a.uid, { label: e.target.value })} placeholder="e.g. Suppress address" />
                    <ErrorText>{labelError}</ErrorText>
                  </div>
                  <select aria-label={`Safety action ${idx + 1} type`} className={`${inputCls} w-40 shrink-0`} value={a.kind} onChange={(e) => setAction(a.uid, { kind: e.target.value })}>
                    <option value="protect">Protective</option>
                    <option value="claim">Opens claim</option>
                  </select>
                  <div className="flex items-center gap-2 pt-2.5 shrink-0">
                    <MoveButtons index={idx} count={form.features.safetyActions.length} onMove={(i, dir) => moveItem('action', i, dir)} label={`safety action ${idx + 1}`} />
                    <button type="button" onClick={() => removeItem('action', idx, a.label)} aria-label={`Remove safety action ${idx + 1}`} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
            {removedRows('action')}
          </div>
        </>
      )}
    </Section>
  );
}

function AdvancedSection({ ed }) {
  const { form, errors, set, isNew, setIdTouched, offset } = ed;
  return (
    <Section id="advanced" title="Advanced" offset={offset}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Id (slug)" required={isNew} path="id" error={errors.id}
          hint={`Used in links: /training/${form.id || '…'}${isNew ? ' — can’t be changed after creating.' : ' · fixed once created.'}`}>
          <input className={`${inputClass(errors.id)} ${!isNew ? 'bg-gray-50 text-gray-400' : ''}`} value={form.id} disabled={!isNew}
            onChange={(e) => { const next = slugify(e.target.value); setIdTouched(next !== ''); set({ id: next }); }} />
        </Field>
        <Field label="Evaluator role" visibility="hidden" hint="Who the AI evaluator acts as when scoring against the custom checklist. Ignored without a checklist.">
          <input className={inputCls} maxLength={LIMITS.evaluatorRole} value={form.evaluatorRole} onChange={(e) => set({ evaluatorRole: e.target.value })} placeholder="expert contact-centre training evaluator" />
        </Field>
      </div>
    </Section>
  );
}

/* ─── Editor ─────────────────────────────────────────────────── */

export default function ScenarioEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const fromId = isNew ? searchParams.get('from') : null;
  const navigate = useNavigate();
  const { usage, refresh: refreshUsage } = useUsage();

  const [form, setForm] = useState(emptyScenario);
  const [documents, setDocuments] = useState([]);
  const [sync, setSync] = useState(null); // { elAgentId, elSyncedAt, elSyncError }
  const [loading, setLoading] = useState(!isNew || !!fromId);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState(null); // 'saving' | 'syncing'
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [removed, setRemoved] = useState([]); // [{ rid, kind, index, item, label }]
  const [rubricDraft, setRubricDraft] = useState(null); // checklist kept while the toggle is off
  const [idTouched, setIdTouched] = useState(false); // stop deriving the id from the name once edited
  const [collapsed, setCollapsed] = useState(() => new Set()); // persona keys
  const [template, setTemplate] = useState('blank');
  const [headerHeight, setHeaderHeight] = useState(0);
  const [activeSection, setActiveSection] = useState('basics');
  const fileRef = useRef(null);
  const saveRef = useRef(null);
  const headerRef = useRef(null);
  const navLockRef = useRef(0); // until this time, scrolling doesn't change the active section

  // Sections near the page bottom can't scroll to the top, so a click sets the highlight directly.
  const jumpTo = (key) => {
    navLockRef.current = Date.now() + 1000;
    setActiveSection(key);
    scrollToSection(key);
  };

  const { isDirty, markSaved, confirmLeave } = useUnsavedChanges(form);

  const liveErrors = useMemo(() => validateScenarioForm(form, { isNew }), [form, isNew]);
  const errors = useMemo(() => ({ ...serverErrors, ...(showErrors ? liveErrors : {}) }), [serverErrors, showErrors, liveErrors]);
  const errorPaths = Object.keys(errors).sort((a, b) => SECTION_RANK[sectionOf(a)] - SECTION_RANK[sectionOf(b)]);

  const applyScenario = useCallback((s) => {
    const next = toForm(s);
    setForm(next);
    setRubricDraft(null);
    setDocuments(s.documents || []);
    setSync({ elAgentId: s.elAgentId, elSyncedAt: s.elSyncedAt, elSyncError: s.sync ? s.sync.error : s.elSyncError });
    return next;
  }, []);

  useEffect(() => {
    if (isNew) return;
    apiFetch(`/api/scenarios/${id}`)
      .then((s) => { const next = applyScenario(s); markSaved(next); setCollapsed(initialCollapsed(next.personas)); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew, applyScenario, markSaved]);

  // Duplicate: /admin/scenarios/new?from=<id> pre-fills an unsaved copy.
  useEffect(() => {
    if (!fromId) return;
    apiFetch(`/api/scenarios/${fromId}`)
      .then((s) => {
        const source = toForm(s);
        const name = `Copy of ${s.name}`.slice(0, LIMITS.name);
        const next = fromTemplate({ ...source, name });
        setForm(next);
        setCollapsed(initialCollapsed(next.personas));
        setNotice(`Duplicated from “${s.name}”. Documents aren’t copied — upload them after creating.`);
      })
      .catch((e) => setError(`Couldn’t load the scenario to duplicate: ${e.message}`))
      .finally(() => setLoading(false));
  }, [fromId]);

  // Poll while any document is still indexing.
  const indexing = documents.some((d) => d.indexStatus === 'indexing' || d.indexStatus === 'pending');
  useEffect(() => {
    if (isNew || !indexing) return undefined;
    const t = setInterval(() => {
      apiFetch(`/api/scenarios/${id}`).then((s) => setDocuments(s.documents || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [indexing, id, isNew]);

  // Sticky header height drives the rail offset and section scroll margins.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  // Highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (loading) return undefined;
    const els = SECTIONS.map(([key]) => document.getElementById(`section-${key}`)).filter(Boolean);
    // Callbacks only list sections whose visibility changed, so keep the full visible set.
    const visible = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      if (Date.now() < navLockRef.current) return; // a nav click already chose the section
      const top = els.find((el) => visible.has(el)); // els are in page order
      if (top) setActiveSection(top.id.replace('section-', ''));
    }, { rootMargin: `-${headerHeight + 8}px 0px -55% 0px` });
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, headerHeight]);

  // Every edit clears errors that came back from the server; client errors are recomputed live.
  const update = (fn) => {
    setForm(fn);
    setServerErrors((prev) => (Object.keys(prev).length ? {} : prev));
  };
  const set = (patch) => update((f) => ({ ...f, ...patch }));
  const setFeatures = (patch) => update((f) => ({ ...f, features: { ...f.features, ...patch } }));
  const setAction = (uid, patch) => update((f) => ({ ...f, features: { ...f.features, safetyActions: f.features.safetyActions.map((a) => (a.uid === uid ? { ...a, ...patch } : a)) } }));
  const setRubricItem = (uid, patch) => update((f) => ({ ...f, rubric: { ...f.rubric, items: f.rubric.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)) } }));
  const setPersona = (key, patch) => update((f) => ({ ...f, personas: f.personas.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));

  /* ─── Lists: reorder, duplicate, remove with undo ──────────── */

  const LISTS = {
    persona: { get: (f) => f.personas, put: (f, list) => ({ ...f, personas: list }) },
    rubricItem: { get: (f) => f.rubric?.items || [], put: (f, list) => ({ ...f, rubric: { ...f.rubric, items: list } }) },
    action: { get: (f) => f.features.safetyActions, put: (f, list) => ({ ...f, features: { ...f.features, safetyActions: list } }) },
  };

  const moveItem = (kind, index, dir) => update((f) => {
    const list = [...LISTS[kind].get(f)];
    const j = index + dir;
    if (j < 0 || j >= list.length) return f;
    [list[index], list[j]] = [list[j], list[index]];
    return LISTS[kind].put(f, list);
  });

  const duplicatePersona = (index) => {
    const source = form.personas[index];
    if (!source || form.personas.length >= LIMITS.personas) return;
    const copy = { ...source, id: undefined, key: newUid(), name: source.name ? `${source.name} (copy)`.slice(0, LIMITS.personaName) : '' };
    update((f) => {
      const list = [...f.personas];
      list.splice(index + 1, 0, copy);
      return { ...f, personas: list };
    });
  };

  const removeItem = (kind, index, label) => {
    const item = LISTS[kind].get(form)[index];
    if (!item) return;
    const rid = newUid();
    update((f) => LISTS[kind].put(f, LISTS[kind].get(f).filter((_, i) => i !== index)));
    setRemoved((r) => [...r, { rid, kind, index, item, label: label || 'Untitled' }]);
    setTimeout(() => setRemoved((r) => r.filter((x) => x.rid !== rid)), UNDO_MS);
  };

  const undoRemove = (rid) => {
    const entry = removed.find((x) => x.rid === rid);
    if (!entry) return;
    update((f) => {
      if (entry.kind === 'rubricItem' && !f.rubric) return f;
      const list = [...LISTS[entry.kind].get(f)];
      list.splice(Math.min(entry.index, list.length), 0, entry.item);
      return LISTS[entry.kind].put(f, list);
    });
    setRemoved((r) => r.filter((x) => x.rid !== rid));
  };

  const removedRows = (kind) => removed.filter((x) => x.kind === kind).map((x) => (
    <RemovedRow key={x.rid} label={x.label} onUndo={() => undoRemove(x.rid)} />
  ));

  const toggleCollapsed = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const setAllCollapsed = (value) => setCollapsed(new Set(value ? form.personas.map((p) => p.key) : []));

  /* ─── Checklist toggle keeps items while off ───────────────── */

  const toggleRubric = (on) => {
    if (on) {
      set({ rubric: rubricDraft || { title: '', items: [emptyRubricItem()] } });
      setRubricDraft(null);
    } else {
      setRubricDraft(form.rubric);
      set({ rubric: null });
      setRemoved((r) => r.filter((x) => x.kind !== 'rubricItem'));
    }
  };

  /* ─── Templates ────────────────────────────────────────────── */

  const pickTemplate = (t) => {
    if (t.id === template) return;
    if (isDirty && !window.confirm(`Replace what you’ve entered with the “${t.label}” template?`)) return;
    const next = t.id === 'blank' ? emptyScenario() : fromTemplate(t.build());
    setForm(next);
    setTemplate(t.id);
    setIdTouched(false);
    setRubricDraft(null);
    setRemoved([]);
    setShowErrors(false);
    setServerErrors({});
    setCollapsed(initialCollapsed(next.personas));
  };

  /* ─── Save / sync / delete ─────────────────────────────────── */

  /** Returns the saved scenario, or null when nothing was saved. */
  const handleSave = async () => {
    if (saving) return null;
    setError(''); setNotice('');
    const clientErrors = validateScenarioForm(form, { isNew });
    if (Object.keys(clientErrors).length > 0) {
      setShowErrors(true);
      focusFirstError(clientErrors);
      return null;
    }
    setSaving(true); setSavePhase('saving');
    // Save and ElevenLabs sync come back in one response; after a moment the slow part is the sync.
    const phaseTimer = setTimeout(() => setSavePhase('syncing'), 800);
    try {
      const body = {
        ...form,
        maxDurationSeconds: Number(form.maxDurationSeconds),
        rubric: form.rubric
          ? { title: form.rubric.title, items: form.rubric.items.map((it) => ({ key: it.key, label: it.label, description: it.description, critical: it.critical })) }
          : null,
        // Handover and safety actions are only scored alongside a checklist.
        features: {
          handoverNote: !!form.rubric && form.features.handoverNote,
          safetyActions: form.rubric ? form.features.safetyActions.map((a) => ({ key: a.key, label: a.label, kind: a.kind })) : [],
          contentWarning: form.features.contentWarning,
          scriptedOnly: form.features.scriptedOnly,
        },
        personas: form.personas.map((p) => {
          const { key: _key, id: pid, scenarioId: _sid, sortOrder: _so, ...rest } = p;
          return pid && !isNew ? { id: pid, ...rest } : rest;
        }),
      };
      const saved = isNew
        ? await apiFetch('/api/scenarios', { method: 'POST', body })
        : await apiFetch(`/api/scenarios/${id}`, { method: 'PUT', body });
      markSaved(applyScenario(saved));
      setRemoved([]);
      setShowErrors(false);
      if (saved.sync && !saved.sync.ok) setError(`Saved, but ElevenLabs sync failed: ${saved.sync.error || 'unknown error'}. Use Retry in the header.`);
      else setNotice(isNew ? 'Scenario created and synced to ElevenLabs.' : 'Saved and synced to ElevenLabs.');
      if (isNew) navigate(`/admin/scenarios/${saved.id}`, { replace: true });
      return saved;
    } catch (e) {
      const field = normalizeServerField(e.data?.field);
      if (field && field !== 'body') {
        setServerErrors({ [field]: e.message });
        focusFirstError({ [field]: e.message });
      } else {
        setError(e.message);
      }
      return null;
    } finally {
      clearTimeout(phaseTimer);
      setSaving(false); setSavePhase(null);
    }
  };

  // Ctrl/⌘+S saves; the ref always points at the latest handler.
  useEffect(() => { saveRef.current = handleSave; });
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Opens a test call pinned to one persona in a new tab. Calls always use the saved, synced
   * scenario, so unsaved changes are saved first. The tab opens before the save so it counts
   * as a user gesture and isn't popup-blocked.
   */
  const testPersona = async (index) => {
    if (isNew) return;
    let personaId = form.personas[index]?.id;
    let tab = null;
    if (isDirty || !personaId) {
      if (!window.confirm('Save & sync your changes before testing? Test calls use the saved scenario.')) return;
      tab = window.open('about:blank', '_blank');
      const saved = await handleSave();
      if (!saved || (saved.sync && !saved.sync.ok)) { tab?.close(); return; }
      personaId = saved.personas?.[index]?.id;
      if (!personaId) { tab?.close(); setError('Couldn’t find that persona after saving. Try again.'); return; }
    }
    const url = `/training/${encodeURIComponent(id)}?persona=${encodeURIComponent(personaId)}&test=1`;
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
  };

  // Only refresh the sync state so unsaved edits survive a retry.
  const handleResync = async () => {
    setSaving(true); setError('');
    try {
      const s = await apiFetch(`/api/scenarios/${id}/sync`, { method: 'POST' });
      setSync({ elAgentId: s.elAgentId, elSyncedAt: s.elSyncedAt, elSyncError: s.sync ? s.sync.error : s.elSyncError });
      if (s.sync?.ok) setNotice('Synced to ElevenLabs.');
      else setError(`ElevenLabs sync failed: ${s.sync?.error || 'unknown error'}`);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${form.name}"? Past sessions keep their history; the ElevenLabs agent and documents are removed.`)) return;
    try { await apiFetch(`/api/scenarios/${id}`, { method: 'DELETE' }); markSaved(form); navigate('/admin/scenarios'); }
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

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  const copy = copyFor(form.claimType);
  const needsOpeningLine = !INSURANCE_TYPES.includes(form.claimType);
  const durationOptions = DURATION_MINUTES.map((m) => m * 60);
  if (!durationOptions.includes(form.maxDurationSeconds)) durationOptions.push(form.maxDurationSeconds);
  durationOptions.sort((a, b) => a - b);
  const ragUsed = documents.reduce((n, d) => n + (d.indexStatus === 'ready' || d.indexStatus === 'indexing' ? d.sizeBytes : 0), 0);

  const onDifficultyKey = (e) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = DIFFICULTIES[(DIFFICULTIES.indexOf(form.difficulty) + dir + DIFFICULTIES.length) % DIFFICULTIES.length];
    set({ difficulty: next });
    e.currentTarget.querySelector(`[data-value="${next}"]`)?.focus();
  };

  const { warnings, positives } = readinessOf({ form, documents, sync, isNew, isDirty });
  const liveErrorCount = Object.keys({ ...liveErrors, ...serverErrors }).length;
  const statuses = Object.fromEntries(SECTIONS.map(([key]) => {
    const hasError = Object.keys({ ...liveErrors, ...serverErrors }).some((p) => sectionOf(p) === key);
    const hasWarning = warnings.some((w) => w.section === key);
    return [key, hasError ? 'error' : hasWarning ? 'warning' : REQUIRED_SECTIONS.has(key) ? 'ok' : null];
  }));
  const showAllErrors = () => {
    setShowErrors(true);
    focusFirstError({ ...liveErrors, ...serverErrors });
  };

  const offset = headerHeight + 16;
  const ed = {
    form, errors, set, setFeatures, setAction, setRubricItem, setPersona, moveItem, removeItem, removedRows, duplicatePersona,
    collapsed, toggleCollapsed, setAllCollapsed, toggleRubric, rubricDraft, isNew, idTouched, setIdTouched, copy, needsOpeningLine,
    usage, refreshUsage, durationOptions, onDifficultyKey, documents, uploading, fileRef, handleUpload, handleRemoveDoc, ragUsed, offset,
    testPersona,
  };

  const saveLabel = savePhase === 'syncing' ? 'Syncing agent…' : savePhase === 'saving' ? 'Saving…' : isNew ? 'Create scenario' : 'Save & sync';

  return (
    <div className="max-w-[1080px]">
      {/* ── Sticky header: status, save and messages stay visible ── */}
      <div ref={headerRef} className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 mb-6 bg-[#f8f9fc]/90 backdrop-blur border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Link to="/admin/scenarios" onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"><ArrowLeft size={12} /> Scenario Builder</Link>
            <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <h1 className="text-[22px] font-bold text-gray-900 truncate">{form.name || (isNew ? 'New scenario' : 'Untitled scenario')}</h1>
              {isDirty && (
                <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SyncChip isNew={isNew} sync={sync} saving={saving} onRetry={handleResync} />
            <UsageBadge usage={usage} />
            <button type="button" disabled={saving} onClick={handleSave} title="Ctrl/⌘ + S" className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#464e7e] text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />} {saveLabel}
            </button>
          </div>
        </div>

        {/* Below xl the rail collapses into the header. */}
        <div className="xl:hidden space-y-2">
          <SectionNav compact active={activeSection} statuses={statuses} onJump={jumpTo} />
          {(warnings.length > 0 || liveErrorCount > 0) && (
            <details className="rounded-xl border border-gray-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-gray-600">
                Readiness · {liveErrorCount > 0 ? `${liveErrorCount} to fix, ` : ''}{warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </summary>
              <div className="mt-2"><ReadinessPanel errorCount={liveErrorCount} warnings={warnings} positives={positives} onShowErrors={showAllErrors} onJump={jumpTo} /></div>
            </details>
          )}
        </div>

        {errorPaths.length > 0 && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
            <p className="font-medium">Fix {errorPaths.length} field{errorPaths.length === 1 ? '' : 's'} to save</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {errorPaths.slice(0, 6).map((p) => (
                <button key={p} type="button" onClick={() => focusFirstError({ [p]: true })} className="text-xs underline decoration-red-300 hover:text-red-700">{fieldLabel(p, form)}</button>
              ))}
              {errorPaths.length > 6 && <span className="text-xs">+{errorPaths.length - 6} more</span>}
            </div>
          </div>
        )}
        {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}
        {notice && <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">{notice}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_240px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {isNew && !fromId && <TemplatePicker selected={template} onPick={pickTemplate} />}
          <BasicsSection ed={ed} />
          <CallerSection ed={ed} />
          <PersonasSection ed={ed} />
          <DocumentsSection ed={ed} />
          <ScoringSection ed={ed} />
          <FeaturesSection ed={ed} />
          <AdvancedSection ed={ed} />
          {!isNew && (
            <GlassCard hover={false} className="p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-red-600">Danger zone</h2>
                  <p className="text-xs text-gray-500 mt-1">Deleting removes the ElevenLabs agent and documents. Past sessions keep their history.</p>
                </div>
                <button type="button" onClick={handleDelete} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50">Delete scenario</button>
              </div>
            </GlassCard>
          )}
        </div>

        <aside className="hidden xl:block sticky space-y-5" style={{ top: offset }}>
          <SectionNav active={activeSection} statuses={statuses} onJump={jumpTo} />
          <div className="border-t border-gray-200 pt-4">
            <ReadinessPanel errorCount={liveErrorCount} warnings={warnings} positives={positives} onShowErrors={showAllErrors} onJump={jumpTo} />
          </div>
          <div className="border-t border-gray-200 pt-4">
            <TestCallPicker personas={form.personas} disabled={isNew} onTest={testPersona} />
          </div>
        </aside>
      </div>
    </div>
  );
}
