import { useState, type FormEvent, type ReactNode } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { orgSchema, paths, projectSchema, ROLE_LABEL, taskTemplateSchema, zoneSchema } from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useDocData, useQueryData } from '../data/useFirestore';
import { Button } from '../ui/Button';
import { ErrorNote, inputClass, TextField } from '../ui/Field';

// Admin: the company's name, its projects and their zones, and its forms.

const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeZones = Intl.supportedValuesOf('timeZone');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-black">{title}</h2>
      {children}
    </section>
  );
}

function CompanyName({ orgId }: { orgId: string }) {
  const { data: org } = useDocData(paths.org(orgId), orgSchema);
  const [name, setName] = useState<string | null>(null);
  const value = name ?? org?.name ?? '';
  const changed = name !== null && name.trim() !== org?.name;
  return (
    <div className="flex gap-2">
      <input aria-label="Company name" className={inputClass} value={value} onChange={(e) => setName(e.target.value)} />
      {changed && (
        <Button
          variant="ink"
          onClick={() => {
            void updateDoc(doc(db, paths.org(orgId)), { name: value.trim() }).catch(console.error);
            setName(null);
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}

function AddZone({ orgId, projectId }: { orgId: string; projectId: string }) {
  const [name, setName] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addDoc(collection(db, paths.zones(orgId)), { name: name.trim(), projectId, geofence: null, createdAt: serverTimestamp() });
    setName('');
  }
  return (
    <form onSubmit={(e) => void add(e)} className="flex gap-2">
      <input aria-label="New zone name" placeholder="e.g. Block A, Level 2" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" variant="ghost" disabled={!name.trim()}>
        Add
      </Button>
    </form>
  );
}

function AddProject({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState(deviceTimeZone);
  const [error, setError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await addDoc(collection(db, paths.projects(orgId)), {
        name: name.trim(),
        address: address.trim(),
        timezone,
        baselineId: null,
        createdAt: serverTimestamp(),
      });
      onDone();
    } catch (err) {
      console.error(err);
      setError('Couldn’t add the project. Check your signal and try again.');
    }
  }

  return (
    <form onSubmit={(e) => void add(e)} className="flex flex-col gap-3 rounded-card border-2 border-yellow bg-white p-4">
      <TextField label="Project name" placeholder="e.g. Riverside Apartments" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
      <label className="flex flex-col gap-1.5 text-sm">
        Timezone (due times and streaks follow it)
        <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button type="submit" variant="ink" className="flex-1" disabled={!name.trim()}>
          Add project
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CompanyScreen({ orgId }: { orgId: string }) {
  const { data: projects } = useQueryData(collection(db, paths.projects(orgId)), `${orgId}/projects`, projectSchema);
  const { data: zones } = useQueryData(collection(db, paths.zones(orgId)), `${orgId}/zones`, zoneSchema);
  const { data: templates } = useQueryData(collection(db, paths.taskTemplates(orgId)), `${orgId}/templates`, taskTemplateSchema);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-8">
      <h1 className="text-3xl font-black">Company</h1>

      <Section title="Name">
        <CompanyName orgId={orgId} />
      </Section>

      <Section title="Projects and zones">
        {projects.length === 0 && !adding && (
          <p className="text-muted">Add your first project. Then add its zones (blocks, levels, areas) and invite your team.</p>
        )}
        {projects.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-card border-2 border-card-line bg-white p-4">
            <div>
              <h3 className="text-lg font-black">{p.name}</h3>
              <p className="text-sm text-muted">{[p.address, p.timezone.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {zones
                .filter((z) => z.projectId === p.id)
                .map((z) => (
                  <li key={z.id} className="rounded-full border-2 border-card-line bg-cream px-3 py-1 text-sm font-black">
                    {z.name}
                  </li>
                ))}
            </ul>
            <AddZone orgId={orgId} projectId={p.id} />
          </div>
        ))}
        {adding ? (
          <AddProject orgId={orgId} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="ghost" caps={false} onClick={() => setAdding(true)}>
            + Add a project
          </Button>
        )}
      </Section>

      <Section title="Forms">
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-card border-2 border-card-line bg-white px-4 py-3">
              <span className="block font-black">{t.name}</span>
              <span className="block text-sm text-muted">
                {ROLE_LABEL[t.role]} · {t.fields.length} fields · {t.xp} XP
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">Building forms from your own templates is coming. For now every company starts with these.</p>
      </Section>
    </div>
  );
}
