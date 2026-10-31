import { ROLE_LABEL } from '@site-streak/shared';
import { useAuth } from '../auth/AuthProvider';
import { Streakee } from '../ui/Streakee';
import { Button } from '../ui/Button';

/** Placeholder for tabs that later steps fill in. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
      <Streakee mood="sleeping" />
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="text-muted">{blurb}</p>
    </div>
  );
}

/** Profile tab: who you are, demo notice and sign out. */
export function MeScreen() {
  const { user, claims, signOut } = useAuth();
  if (!user || !claims) return null;
  return (
    <div className="flex flex-col gap-5 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-6">
      <h1 className="text-3xl font-black">{user.displayName ?? (claims.demo ? 'Demo visitor' : 'Me')}</h1>
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
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-card border-2 border-card-line bg-white p-4">
        <dt className="text-muted">Role</dt>
        <dd className="font-black">{ROLE_LABEL[claims.role]}</dd>
        {user.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="font-black break-all">{user.email}</dd>
          </>
        )}
      </dl>
      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
