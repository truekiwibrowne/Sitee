import { useState } from 'react';
import { collection } from 'firebase/firestore';
import {
  CATEGORY_LABEL,
  FREQUENCY_LABEL,
  formatTimeOfDay,
  paths,
  projectSchema,
  ROLE_LABEL,
  STARTER_FORMS,
  taskTemplateSchema,
  templateBodySchema,
  type TaskTemplate,
  type TemplateBody,
} from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useQueryData } from '../data/useFirestore';
import { Button } from '../ui/Button';
import { BLANK_FORM, FormEditor } from './FormEditor';

// Admin: the company's forms (toolbox talks, inspections, audits…) and the starter library.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** e.g. "Weekly · Mon, Thu · 10 am" */
function scheduleSummary(t: TemplateBody): string {
  const days =
    t.frequency === 'weekly' ? t.weekdays.map((d) => WEEKDAYS[d]).join(', ')
    : t.frequency === 'monthly' ? t.monthDays.map(ordinal).join(', ')
    : t.frequency === 'yearly' ? t.yearDates.join(', ')
    : t.frequency === 'once' ? t.onceDate
    : null;
  const label = t.frequency === 'workday' ? 'Every work day' : FREQUENCY_LABEL[t.frequency].replace(' (assigned by hand)', '');
  return [label, days, t.dueTimes.map(formatTimeOfDay).join(', ')].filter(Boolean).join(' · ');
}

type Editing = { id: string | null; isNew: boolean; body: TemplateBody } | 'pick' | null;

export function FormsScreen({ orgId }: { orgId: string }) {
  const { data: forms } = useQueryData(collection(db, paths.taskTemplates(orgId)), `${orgId}/templates`, taskTemplateSchema);
  const { data: projects } = useQueryData(collection(db, paths.projects(orgId)), `${orgId}/projects`, projectSchema);
  const [editing, setEditing] = useState<Editing>(null);

  if (editing && editing !== 'pick') {
    return <FormEditor orgId={orgId} formId={editing.id} isNew={editing.isNew} initial={editing.body} projects={projects} onDone={() => setEditing(null)} />;
  }

  const projectNames = (t: TaskTemplate) =>
    t.projectIds.length === 0 ? 'All projects' : t.projectIds.map((id) => projects.find((p) => p.id === id)?.name).filter(Boolean).join(', ');
  const used = new Set(forms.map((f) => f.id));
  // The body schema drops id and createdAt, leaving what the editor changes.
  const bodyOf = (f: TaskTemplate): TemplateBody => templateBodySchema.parse(f);

  return (
    <div className="flex flex-col gap-5 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-8">
      <h1 className="text-3xl font-black">Forms</h1>
      <p className="text-muted">
        Toolbox talks, inspections and audits. Each form runs on the projects you pick, for one role, on the days and times you set.
      </p>

      {editing === 'pick' ? (
        <section className="flex flex-col gap-2 rounded-card border-2 border-yellow bg-white p-4">
          <h2 className="text-lg font-black">Start from…</h2>
          <Button variant="ghost" caps={false} onClick={() => setEditing({ id: null, isNew: true, body: BLANK_FORM })}>
            A blank form
          </Button>
          {Object.entries(STARTER_FORMS)
            .filter(([id]) => !used.has(id))
            .map(([id, starter]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEditing({ id, isNew: true, body: starter })}
                className="press flex flex-col items-start rounded-btn border-2 border-card-line bg-cream px-4 py-3 text-left shadow-chunky-locked"
              >
                <span className="font-black">{starter.name}</span>
                <span className="text-sm text-muted">
                  {CATEGORY_LABEL[starter.category]} · {ROLE_LABEL[starter.role]}
                  {starter.standardRef ? ` · ${starter.standardRef}` : ''}
                </span>
              </button>
            ))}
          <p className="text-xs text-muted">
            Starters follow what ISO 9001, 14001 and 45001 ask sites to record. Adjust them to match your own management system.
          </p>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </section>
      ) : (
        <Button onClick={() => setEditing('pick')}>New form</Button>
      )}

      <ul className="flex flex-col gap-2">
        {forms.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setEditing({ id: f.id, isNew: false, body: bodyOf(f) })}
              className={`press flex w-full flex-col items-start gap-0.5 rounded-card border-2 bg-white px-4 py-3 text-left shadow-chunky-locked ${f.active ? 'border-card-line' : 'border-dashed border-locked-shadow opacity-70'}`}
            >
              <span className="font-black">
                {f.name}
                {!f.active && <span className="ml-2 text-sm font-bold text-muted">off</span>}
              </span>
              <span className="text-sm text-muted">
                {CATEGORY_LABEL[f.category]} · {ROLE_LABEL[f.role]} · {f.xp} XP
              </span>
              <span className="text-sm text-muted">{scheduleSummary(f)}</span>
              <span className="text-sm text-muted">{projectNames(f)}</span>
              {f.standardRef && <span className="text-xs font-bold text-teal-shadow">{f.standardRef}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
