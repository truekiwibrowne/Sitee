import { ROLE_LABEL } from '@site-streak/shared';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { Button } from './ui/Button';

export function App() {
  const { loading, user, claims, refreshClaims, signOut } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <img src="/icon.svg" alt="Loading" className="size-20 animate-pulse" />
      </main>
    );
  }

  if (!user) return <SignIn />;

  if (!claims) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col justify-center gap-5 px-5 text-center">
        <img src="/icon.svg" alt="" className="mx-auto size-24" />
        <h1 className="text-2xl font-black">You’re in! Almost…</h1>
        <p className="text-muted">
          Your admin still needs to add you to a site and give you a role. Ask them, then tap below.
        </p>
        <Button onClick={refreshClaims}>Check again</Button>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </main>
    );
  }

  // Placeholder home until the Foreman Today screen (step 5).
  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col gap-5 px-5 py-10">
      <h1 className="text-3xl font-black">Hi, {user.displayName ?? 'there'}!</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-card border-2 border-card-line bg-white p-4">
        <dt className="text-muted">Role</dt>
        <dd className="font-black">{ROLE_LABEL[claims.role]}</dd>
        <dt className="text-muted">Org</dt>
        <dd className="font-black">{claims.orgId}</dd>
      </dl>
      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </main>
  );
}
