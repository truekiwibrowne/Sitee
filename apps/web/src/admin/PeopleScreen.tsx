import { useState, type FormEvent } from 'react';
import { collection, query, where } from 'firebase/firestore';
import {
  inviteSchema,
  projectSchema,
  ROLE_LABEL,
  ROLES,
  userSchema,
  zoneSchema,
  paths,
  type Project,
  type Role,
  type Zone,
} from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useQueryData } from '../data/useFirestore';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Check, ErrorNote, inputClass, TextField } from '../ui/Field';
import { cancelInvite, inviteMember, messageOf, removeMember, updateMember } from './api';

// Admin: invite people and set their role, projects and zones.

type Places = { projectIds: string[]; zoneIds: string[] };
type Named<T> = T & { id: string };

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      Role
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as Role)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Projects with their zones as tick boxes. Ticking a zone also ticks its project. */
function PlacePicker({ projects, zones, value, onChange }: { projects: Named<Project>[]; zones: Named<Zone>[]; value: Places; onChange: (p: Places) => void }) {
  if (projects.length === 0) return <p className="text-sm text-muted">Add a project on the Company tab first.</p>;
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm">Projects and zones</legend>
      {projects.map((p) => (
        <div key={p.id} className="rounded-btn border-2 border-card-line p-2">
          <Check
            checked={value.projectIds.includes(p.id)}
            onChange={(on) =>
              onChange({
                projectIds: toggle(value.projectIds, p.id, on),
                // Unticking a project unticks its zones.
                zoneIds: on ? value.zoneIds : value.zoneIds.filter((z) => zones.find((zz) => zz.id === z)?.projectId !== p.id),
              })
            }
          >
            {p.name}
          </Check>
          <div className="flex flex-col pl-7">
            {zones
              .filter((z) => z.projectId === p.id)
              .map((z) => (
                <Check
                  key={z.id}
                  checked={value.zoneIds.includes(z.id)}
                  onChange={(on) =>
                    onChange({
                      projectIds: on ? toggle(value.projectIds, p.id, true) : value.projectIds,
                      zoneIds: toggle(value.zoneIds, z.id, on),
                    })
                  }
                >
                  <span className="font-normal">{z.name}</span>
                </Check>
              ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function InviteForm({ projects, zones, onDone }: { projects: Named<Project>[]; zones: Named<Zone>[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('foreman');
  const [places, setPlaces] = useState<Places>({ projectIds: [], zoneIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await inviteMember({ name: name.trim(), email: email.trim(), role, ...places });
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void send(e)} className="flex flex-col gap-3 rounded-card border-2 border-yellow bg-white p-4">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <TextField label="Email (they sign in with this)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      <RoleSelect value={role} onChange={setRole} />
      <PlacePicker projects={projects} zones={zones} value={places} onChange={setPlaces} />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button type="submit" variant="ink" className="flex-1" disabled={busy || !name.trim() || !email.includes('@')}>
          {busy ? 'Sending…' : 'Send invite'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-sm text-muted">They sign in to Site Streak with this email, and they’re in.</p>
    </form>
  );
}

function EditMember({ uid, isMe, initial, projects, zones, onDone }: { uid: string; isMe: boolean; initial: { role: Role } & Places; projects: Named<Project>[]; zones: Named<Zone>[]; onDone: () => void }) {
  const [role, setRole] = useState<Role>(initial.role);
  const [places, setPlaces] = useState<Places>({ projectIds: initial.projectIds, zoneIds: initial.zoneIds });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t-2 border-card-line pt-3">
      <RoleSelect value={role} onChange={setRole} />
      <PlacePicker projects={projects} zones={zones} value={places} onChange={setPlaces} />
      <ErrorNote>{error}</ErrorNote>
      <Button variant="ink" disabled={busy} onClick={() => void run(() => updateMember({ uid, role, ...places }))}>
        Save
      </Button>
      {!isMe && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Remove this person from your company? Their past reports stay.')) void run(() => removeMember({ uid }));
          }}
        >
          Remove from company
        </Button>
      )}
      <p className="text-xs text-muted">Role changes reach their phone within an hour, or straight away when they reopen the app.</p>
    </div>
  );
}

export function PeopleScreen({ orgId, uid }: { orgId: string; uid: string }) {
  const { data: people } = useQueryData(collection(db, paths.users(orgId)), `${orgId}/users`, userSchema);
  const { data: projects } = useQueryData(collection(db, paths.projects(orgId)), `${orgId}/projects`, projectSchema);
  const { data: zones } = useQueryData(collection(db, paths.zones(orgId)), `${orgId}/zones`, zoneSchema);
  const { data: invites } = useQueryData(query(collection(db, 'invites'), where('orgId', '==', orgId)), `${orgId}/invites`, inviteSchema);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const placeNames = (ids: string[], list: Named<{ name: string }>[]) =>
    ids.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean).join(', ');

  return (
    <div className="flex flex-col gap-6 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-8">
      <h1 className="text-3xl font-black">People</h1>

      {inviting ? (
        <InviteForm projects={projects} zones={zones} onDone={() => setInviting(false)} />
      ) : (
        <Button onClick={() => setInviting(true)}>Invite someone</Button>
      )}

      {invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-black">Waiting to join</h2>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-card border-2 border-dashed border-locked-shadow bg-white px-4 py-3">
              <span className="min-w-0">
                <span className="block font-black">{i.name}</span>
                <span className="block truncate text-sm text-muted">
                  {i.email} · {ROLE_LABEL[i.role]}
                </span>
              </span>
              <button type="button" className="min-h-11 shrink-0 text-sm font-bold text-muted underline" onClick={() => void cancelInvite({ email: i.email }).catch(console.error)}>
                Cancel
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-black">Team</h2>
        {people.map((p) => (
          <div key={p.id} className="rounded-card border-2 border-card-line bg-white p-3">
            <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} className="flex w-full items-center gap-3 text-left" aria-expanded={editing === p.id}>
              <Avatar id={p.avatar} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block font-black">
                  {p.name}
                  {p.id === uid && <span className="ml-1 text-sm font-bold text-muted">(you)</span>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {[ROLE_LABEL[p.role], placeNames(p.zoneIds, zones) || placeNames(p.projectIds, projects)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-muted">{editing === p.id ? '⌃' : '›'}</span>
            </button>
            {editing === p.id && (
              <EditMember
                uid={p.id}
                isMe={p.id === uid}
                initial={{ role: p.role, projectIds: p.projectIds, zoneIds: p.zoneIds }}
                projects={projects}
                zones={zones}
                onDone={() => setEditing(null)}
              />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
