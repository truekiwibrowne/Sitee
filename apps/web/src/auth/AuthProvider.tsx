import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { isRole, type UserClaims } from '@site-streak/shared';
import { auth } from '../lib/firebase';

type AuthState = {
  loading: boolean;
  user: User | null;
  /** Null when signed in but an admin hasn't given this person a role yet. */
  claims: UserClaims | null;
  /** Re-fetches the token, e.g. after an admin has just set the role. */
  refreshClaims: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; user: User | null; claims: UserClaims | null }>({
    loading: true,
    user: null,
    claims: null,
  });

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) {
          setState({ loading: false, user: null, claims: null });
          return;
        }
        const { claims } = await user.getIdTokenResult();
        const valid = typeof claims.orgId === 'string' && isRole(claims.role);
        setState({
          loading: false,
          user,
          claims: valid ? { orgId: claims.orgId as string, role: claims.role as UserClaims['role'] } : null,
        });
      }),
    [],
  );

  const value: AuthState = {
    ...state,
    refreshClaims: async () => {
      await auth.currentUser?.getIdToken(true);
    },
    signOut: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
