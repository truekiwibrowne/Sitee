import { doc, updateDoc } from 'firebase/firestore';
import { CHARACTER_INFO, CHARACTERS, paths, ROLE_LABEL, userSchema, type CharacterId } from '@site-streak/shared';
import { useAuth } from '../auth/AuthProvider';
import { useDocData } from '../data/useFirestore';
import { HistoryList } from '../history/History';
import { db } from '../lib/firebase';
import { Avatar } from '../ui/Avatar';
import { Brix } from '../ui/Brix';
import { Button } from '../ui/Button';

/** Placeholder for tabs that later steps fill in. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
      <Brix mood="sleeping" />
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="text-muted">{blurb}</p>
    </div>
  );
}

/** Pick the character people see on leaderboards and your profile. */
function AvatarPicker({ orgId, uid, current }: { orgId: string; uid: string; current: CharacterId }) {
  return (
    <div role="radiogroup" aria-label="Your character" className="grid grid-cols-2 gap-2">
      {CHARACTERS.map((id) => {
        const on = id === current;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            // Offline-safe: Firestore queues the change.
            onClick={() => void updateDoc(doc(db, paths.users(orgId), uid), { avatar: id }).catch(console.error)}
            className={`press flex flex-col items-center gap-1 rounded-card border-2 bg-white p-3 ${
              on ? 'border-ink shadow-chunky-ink' : 'border-card-line shadow-chunky-locked'
            }`}
          >
            <Avatar id={id} size={64} />
            <span className="font-black">{CHARACTER_INFO[id].name}</span>
            <span className="text-center text-xs text-muted">{CHARACTER_INFO[id].blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Profile tab: who you are, your character, your past reports, demo notice and sign out. */
export function MeScreen({ onOpenSubmission }: { onOpenSubmission?: (submissionId: string) => void }) {
  const { user, claims, signOut } = useAuth();
  const { data: me } = useDocData(user && claims ? `${paths.users(claims.orgId)}/${user.uid}` : null, userSchema);
  if (!user || !claims) return null;

  return (
    <div className="flex flex-col gap-5 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-6">
      <div className="flex items-center gap-3">
        {me && <Avatar id={me.avatar} size={64} />}
        <div>
          <h1 className="text-3xl font-black">{me?.name ?? user.displayName ?? (claims.demo ? 'Demo visitor' : 'Me')}</h1>
          <p className="font-bold text-muted">{ROLE_LABEL[claims.role]}</p>
        </div>
      </div>

      {claims.demo && (
        <div className="flex flex-col gap-2 rounded-card border-2 border-yellow bg-white p-4">
          <p>
            <strong className="font-black">Demo mode.</strong> Everything here is sample data and resets after a day.
          </p>
          <Button variant="ink" onClick={signOut}>
            Create a real account
          </Button>
        </div>
      )}

      {me && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-black">Your character</h2>
          <AvatarPicker orgId={claims.orgId} uid={user.uid} current={me.avatar} />
        </section>
      )}

      {onOpenSubmission && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-black">My reports</h2>
          <HistoryList orgId={claims.orgId} uid={user.uid} onOpen={onOpenSubmission} />
        </section>
      )}

      {user.email && <p className="text-sm text-muted break-all">Signed in as {user.email}</p>}
      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
