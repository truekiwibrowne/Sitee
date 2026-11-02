import { AdminApp } from './admin/AdminApp';
import { useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { Welcome } from './auth/Welcome';
import { WorkerApp } from './foreman/WorkerApp';
import { Splash, useSplash } from './shell/Splash';

export function App() {
  const { loading, user, claims } = useAuth();
  const showSplash = useSplash(loading);

  if (showSplash) return <Splash />;

  // A demo visitor stays on the sign-in screen until their sandbox is ready.
  if (!user || (user.isAnonymous && !claims)) return <SignIn />;

  if (!claims) return <Welcome />;

  if (claims.role === 'admin') return <AdminApp orgId={claims.orgId} uid={user.uid} />;
  return <WorkerApp orgId={claims.orgId} uid={user.uid} />;
}
