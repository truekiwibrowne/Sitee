import { ROLE_LABEL } from '@site-streak/shared';
import { AdminApp } from './admin/AdminApp';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { Welcome } from './auth/Welcome';
import { ForemanApp } from './foreman/ForemanApp';
import { ComingSoon, MeScreen } from './shell/SimpleScreens';
import { Splash, useSplash } from './shell/Splash';

export function App() {
  const { loading, user, claims } = useAuth();
  const showSplash = useSplash(loading);

  if (showSplash) return <Splash />;

  // A demo visitor stays on the sign-in screen until their sandbox is ready.
  if (!user || (user.isAnonymous && !claims)) return <SignIn />;

  if (!claims) return <Welcome />;

  if (claims.role === 'admin') return <AdminApp orgId={claims.orgId} uid={user.uid} />;
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
