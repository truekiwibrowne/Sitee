import { ROLE_LABEL } from '@site-streak/shared';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { ForemanApp } from './foreman/ForemanApp';
import { ComingSoon, MeScreen } from './shell/SimpleScreens';
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

  // A demo visitor stays on the sign-in screen until their sandbox is ready.
  if (!user || (user.isAnonymous && !claims)) return <SignIn />;

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

  if (claims.role === 'foreman') return <ForemanApp orgId={claims.orgId} uid={user.uid} />;

  // Other roles' Today screens come after the MVP foreman flow.
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
      <ComingSoon
        title={`${ROLE_LABEL[claims.role]} view`}
        blurb="Your Today screen is on its way. For now, try the foreman demo to see the app in action."
      />
      <MeScreen />
    </main>
  );
}
