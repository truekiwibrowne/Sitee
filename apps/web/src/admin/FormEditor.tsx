import { useState, type ReactNode } from 'react';
import { deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  CATEGORY_LABEL,
  FORM_CATEGORIES,
  FREQUENCIES,
  FREQUENCY_LABEL,
  paths,
  ROLE_LABEL,
  ROLES,
  templateBodySchema,
  type FieldType,
  type Project,
  type TemplateBody,
  type TemplateField,
} from '@site-streak/shared';
import { db } from '../lib/firebase';
import { Button } from '../ui/Button';
import { Check, ErrorNote, inputClass, TextField } from '../ui/Field';

// Admin: build or change a form, who fills it in, on which projects, and when.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'pickList', label: 'Pick from a list' },
  { type: 'number', label: 'Number' },
  { type: 'text', label: 'Text' },
  { type: 'photo', label: 'Photos' },
];

export const BLANK_FORM: TemplateBody = {
  name: '',
  category: 'other',
  role: 'foreman',
  projectIds: [],
  frequency: 'workday',
  dueTimes: ['17:00'],
  weekdays: [],
  monthDays: [],
  yearDates: [],
  onceDate: null,
  xp: 30,
  reviewRule: 'levelAbove',
  countsForStreak: false,
  unlockRules: [],
  fields: [{ id: 'notes', label: 'Notes', type: 'text', required: true }],
  active: true,
};

/** A field id from its label: letters and digits, camelCase, unique in the form. */
function fieldIdFor(label: string, taken: string[]): string {
  const words = label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') || 'field';
  if (!/^[a-z]/.test(base)) base = `f${base}`;
  let candidate = base;
  for (let n = 2; taken.includes(candidate); n++) candidate = `${base}${n}`;
  return candidate;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border-2 border-card-line bg-white p-4">
      <h2 className="text-lg font-black">{title}</h2>
      {children}
    </section>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label}
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 min-w-11 rounded-btn border-2 px-2 font-black ${on ? 'border-ink bg-ink text-white' : 'border-card-line bg-white'}`}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function FieldEditor({ field, onChange, onMove, onRemove, first, last }: { field: TemplateField; onChange: (f: TemplateField) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; first: boolean; last: boolean }) {
  function changeType(type: FieldType) {
    const common = { id: field.id, label: field.label, required: field.required };
    if (type === 'pickList') onChange({ ...common, type, options: ['Yes', 'No', 'N/A'] });
    else if (type === 'number') onChange({ ...common, type, min: 0 });
    else if (type === 'photo') onChange({ ...common, type, minPhotos: 1 });
    else onChange({ ...common, type: 'text' });
  }
  return (
    <div className="flex flex-col gap-2 rounded-btn border-2 border-card-line bg-cream p-3">
      <TextField label="Question" value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />
      <Select label="Answer type" value={field.type} options={FIELD_TYPES.map((t) => ({ value: t.type, label: t.label }))} onChange={changeType} />
      {field.type === 'pickList' && (
        <label className="flex flex-col gap-1.5 text-sm">
          Choices (one per line)
          <textarea
            rows={3}
            className={`${inputClass} py-2`}
            value={field.options.join('\n')}
            onChange={(e) => onChange({ ...field, options: e.target.value.split('\n').map((o) => o.trimStart()) })}
          />
        </label>
      )}
      {field.type === 'number' && (
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Unit (optional)" value={field.unit ?? ''} onChange={(e) => onChange({ ...field, unit: e.target.value || undefined })} />
          <TextField label="Lowest allowed" type="number" value={field.min ?? ''} onChange={(e) => onChange({ ...field, min: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
      )}
      {field.type === 'photo' && (
        <TextField label="Fewest photos" type="number" min={0} value={field.minPhotos} onChange={(e) => onChange({ ...field, minPhotos: Math.max(0, Number(e.target.value) || 0) })} />
      )}
      <div className="flex items-center justify-between">
        <Check checked={field.required} onChange={(required) => onChange({ ...field, required })}>
          Must be answered
        </Check>
        <div className="flex gap-1">
          <button type="button" className="min-h-11 min-w-11 font-black text-muted disabled:opacity-30" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="min-h-11 min-w-11 font-black text-muted disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="min-h-11 px-2 text-sm font-bold text-coral-shadow underline" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

/** `formId` is null for a blank form; a starter keeps its own id but is still new. */
export function FormEditor({ orgId, formId, isNew, initial, projects, onDone }: { orgId: string; formId: string | null; isNew: boolean; initial: TemplateBody; projects: (Project & { id: string })[]; onDone: () => void }) {
  const [form, setForm] = useState<TemplateBody>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TemplateBody>(key: K, value: TemplateBody[K]) => setForm((f) => ({ ...f, [key]: value }));
  const scheduled = form.frequency !== 'onDemand';

  function setField(i: number, field: TemplateField) {
    set('fields', form.fields.map((f, j) => (j === i ? field : f)));
  }
  function moveField(i: number, d: -1 | 1) {
    const next = [...form.fields];
    const [moved] = next.splice(i, 1);
    next.splice(i + d, 0, moved!);
    set('fields', next);
  }
  function addField() {
    set('fields', [...form.fields, { id: fieldIdFor('New question', form.fields.map((f) => f.id)), label: 'New question', type: 'text', required: false }]);
  }

  async function save() {
    // Tidy choices, and drop schedule parts that don't apply to the chosen frequency.
    const tidy: TemplateBody = {
      ...form,
      name: form.name.trim(),
      fields: form.fields.map((f) => (f.type === 'pickList' ? { ...f, options: f.options.map((o) => o.trim()).filter(Boolean) } : f)),
      dueTimes: scheduled ? [...new Set(form.dueTimes)].sort() : [],
      weekdays: form.frequency === 'weekly' ? form.weekdays : [],
      monthDays: form.frequency === 'monthly' ? form.monthDays : [],
      yearDates: form.frequency === 'yearly' ? form.yearDates : [],
      onceDate: form.frequency === 'once' ? form.onceDate : null,
      countsForStreak: form.countsForStreak && scheduled && form.dueTimes.length > 0,
    };
    const parsed = templateBodySchema.safeParse(tidy);
    const missing =
      (tidy.frequency === 'weekly' && !tidy.weekdays.length && 'Pick at least one day of the week.') ||
      (tidy.frequency === 'monthly' && !tidy.monthDays.length && 'Pick at least one day of the month.') ||
      (tidy.frequency === 'yearly' && !tidy.yearDates.length && 'Add at least one date in the year.') ||
      (tidy.frequency === 'once' && !tidy.onceDate && 'Pick the date.');
    if (!parsed.success || missing) {
      const issue = parsed.success ? null : parsed.error.issues[0];
      setError(missing || (issue ? `${issue.path.join(' › ') || 'Form'}: ${issue.message}` : 'Check the form.'));
      return;
    }
    setSaving(true);
    try {
      const id = formId ?? `${fieldIdFor(tidy.name, []).toLowerCase()}-${Date.now().toString(36)}`;
      await setDoc(
        doc(db, paths.taskTemplates(orgId), id),
        {
          ...parsed.data,
          // Clearing the reference must remove the old one (merge keeps fields that aren't sent).
          standardRef: parsed.data.standardRef ?? deleteField(),
          ...(isNew ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true },
      );
      onDone();
    } catch (err) {
      console.error(err);
      setError('Couldn’t save. Check your signal and try again.');
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-8">
      <button type="button" onClick={onDone} className="min-h-11 self-start font-bold text-muted underline">
        ← Forms
      </button>
      <h1 className="text-3xl font-black">{isNew ? 'New form' : 'Edit form'}</h1>

      <Section title="Basics">
        <TextField label="Form name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Scaffold inspection" />
        <Select label="Type" value={form.category} options={FORM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} onChange={(v) => set('category', v)} />
        <TextField label="Standard reference (optional)" value={form.standardRef ?? ''} onChange={(e) => set('standardRef', e.target.value || undefined)} placeholder="e.g. ISO 45001 §9.1.1" />
        <Select label="Filled in by" value={form.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} onChange={(v) => set('role', v)} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="XP" type="number" min={0} max={500} value={form.xp} onChange={(e) => set('xp', Math.max(0, Number(e.target.value) || 0))} />
          <Select
            label="Checked by"
            value={form.reviewRule}
            options={[
              { value: 'levelAbove', label: 'The role above' },
              { value: 'none', label: 'Nobody' },
            ]}
            onChange={(v) => set('reviewRule', v)}
          />
        </div>
        <p className="-mt-2 text-sm text-muted">
          {form.reviewRule === 'none' ? 'XP is paid as soon as it’s sent, at two stars.' : 'The person above rates it 1–3 stars, which sets the XP.'}
        </p>
        <Check checked={form.countsForStreak} onChange={(v) => set('countsForStreak', v)}>
          Missing the due time breaks the streak
        </Check>
        <Check checked={form.active} onChange={(v) => set('active', v)}>
          Switched on (creates tasks)
        </Check>
      </Section>

      <Section title="Projects">
        <Check checked={form.projectIds.length === 0} onChange={(all) => set('projectIds', all ? [] : projects.slice(0, 1).map((p) => p.id))}>
          Every project
        </Check>
        {form.projectIds.length > 0 &&
          projects.map((p) => (
            <Check key={p.id} checked={form.projectIds.includes(p.id)} onChange={() => set('projectIds', toggle(form.projectIds, p.id))}>
              <span className="font-normal">{p.name}</span>
            </Check>
          ))}
      </Section>

      <Section title="When">
        <Select label="How often" value={form.frequency} options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} onChange={(v) => set('frequency', v)} />
        {form.frequency === 'weekly' && (
          <div className="flex flex-wrap gap-1.5" aria-label="Days of the week">
            {WEEKDAYS.map((d, i) => (
              <Chip key={d} on={form.weekdays.includes(i)} onClick={() => set('weekdays', toggle(form.weekdays, i).sort())}>
                {d}
              </Chip>
            ))}
          </div>
        )}
        {form.frequency === 'monthly' && (
          <div className="grid grid-cols-7 gap-1.5" aria-label="Days of the month">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <Chip key={d} on={form.monthDays.includes(d)} onClick={() => set('monthDays', toggle(form.monthDays, d).sort((a, b) => a - b))}>
                {d}
              </Chip>
            ))}
            <p className="col-span-7 text-xs text-muted">31 means the last day in shorter months.</p>
          </div>
        )}
        {form.frequency === 'yearly' && (
          <div className="flex flex-col gap-2">
            {form.yearDates.map((md, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="date"
                  aria-label="Date in the year"
                  className={inputClass}
                  value={`2026-${md}`}
                  onChange={(e) => set('yearDates', form.yearDates.map((x, j) => (j === i ? e.target.value.slice(5) : x)))}
                />
                <button type="button" className="min-h-11 px-2 text-sm font-bold text-coral-shadow underline" onClick={() => set('yearDates', form.yearDates.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <Button variant="ghost" caps={false} onClick={() => set('yearDates', [...form.yearDates, '01-15'])}>
              + Add a date
            </Button>
          </div>
        )}
        {form.frequency === 'once' && (
          <input type="date" aria-label="Date" className={inputClass} value={form.onceDate ?? ''} onChange={(e) => set('onceDate', e.target.value || null)} />
        )}
        {scheduled && (
          <div className="flex flex-col gap-2">
            <span className="text-sm">Due by (project time). Add more times to do it several times a day.</span>
            {form.dueTimes.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="time"
                  aria-label={`Due time ${i + 1}`}
                  className={inputClass}
                  value={t}
                  onChange={(e) => set('dueTimes', form.dueTimes.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="min-h-11 px-2 text-sm font-bold text-coral-shadow underline" onClick={() => set('dueTimes', form.dueTimes.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            {form.dueTimes.length < 12 && (
              <Button variant="ghost" caps={false} onClick={() => set('dueTimes', [...form.dueTimes, '12:00'])}>
                + Add a due time
              </Button>
            )}
            {form.dueTimes.length === 0 && <p className="text-xs text-muted">No due time: it can be done any time that day.</p>}
          </div>
        )}
        {!scheduled && <p className="text-sm text-muted">A site manager assigns it when it’s needed (for example, a hold point when the rebar is ready).</p>}
      </Section>

      <Section title={`Questions (${form.fields.length})`}>
        {form.fields.map((f, i) => (
          <FieldEditor
            key={f.id}
            field={f}
            first={i === 0}
            last={i === form.fields.length - 1}
            onChange={(next) => setField(i, next)}
            onMove={(d) => moveField(i, d)}
            onRemove={() => set('fields', form.fields.filter((_, j) => j !== i))}
          />
        ))}
        <Button variant="ghost" caps={false} onClick={addField}>
          + Add a question
        </Button>
      </Section>

      <ErrorNote>{error}</ErrorNote>
      {/* Not sticky: the admin bottom nav already sits there. */}
      <Button variant="ink" className="w-full" disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save form'}
      </Button>
    </div>
  );
}
