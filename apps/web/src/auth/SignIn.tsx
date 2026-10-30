import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { ROLE_LABEL } from '@site-streak/shared';
import { auth } from '../lib/firebase';
import { Button } from '../ui/Button';
import { DEV_PASSWORD, DEV_USERS } from './devUsers';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

const inputClass =
  'min-h-12 w-full rounded-btn border-2 border-card-line bg-white px-4 text-lg font-bold text-ink placeholder:text-muted/60 focus:border-yellow focus:outline-none';

function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'That email or password isn’t right.';
  if (code.includes('email-already-in-use')) return 'There’s already an account with that email. Sign in instead.';
  if (code.includes('weak-password')) return 'Pick a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return '';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google window. Allow pop-ups and try again.';
  if (code.includes('too-many-requests')) return 'Too many tries. Wait a few minutes and try again.';
  if (code.includes('network-request-failed')) return 'No signal. Try again when you’re back online.';
  console.error('Sign-in failed', err);
  return 'Something went wrong. Please try again.';
}

export function SignIn() {
  const [error, setError] = useState('');

  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/icon.svg" alt="" className="size-24" />
        <h1 className="text-3xl font-black">Site Streak</h1>
        <p className="text-muted">Sign in to start today’s tasks.</p>
      </div>

      <Button
        variant="ghost"
        caps={false}
        className="flex items-center justify-center gap-3"
        onClick={() => {
          setError('');
          signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => setError(friendlyError(err)));
        }}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
        <span className="h-0.5 flex-1 bg-card-line" />
        or use email
        <span className="h-0.5 flex-1 bg-card-line" />
      </div>

      <EmailPasswordForm onError={setError} />

      {error && (
        <p role="alert" className="rounded-card border-2 border-coral bg-white px-4 py-3 text-coral-shadow">
          {error}
        </p>
      )}

      {useEmulators && <DevSignIn onError={setError} />}
    </main>
  );
}

type Mode = 'signIn' | 'create' | 'reset';

function EmailPasswordForm({ onError }: { onError: (msg: string) => void }) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setResetSent(false);
    onError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    onError('');
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'create') {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(user, { displayName: name.trim() });
        // The token listener fired before the name was set; refresh so the app sees it.
        await user.reload();
        await user.getIdToken(true);
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setResetSent(true);
      }
    } catch (err) {
      onError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.includes('@') && (mode === 'reset' || password.length >= 6) && (mode !== 'create' || name.trim().length > 0);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === 'create' && (
        <>
          <label htmlFor="name" className="text-sm">
            Your name
          </label>
          <input id="name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}

      <label htmlFor="email" className="text-sm">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        className={inputClass}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {mode !== 'reset' && (
        <>
          <label htmlFor="password" className="text-sm">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </>
      )}

      {resetSent ? (
        <p className="rounded-card border-2 border-card-line bg-white px-4 py-3">
          Check your email for a link to set a new password.
        </p>
      ) : (
        <Button type="submit" disabled={busy || !canSubmit}>
          {mode === 'signIn' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Send reset link'}
        </Button>
      )}

      <div className="flex justify-between text-sm">
        {mode === 'signIn' ? (
          <>
            <TextLink onClick={() => switchTo('create')}>New here? Create account</TextLink>
            <TextLink onClick={() => switchTo('reset')}>Forgot password?</TextLink>
          </>
        ) : (
          <TextLink onClick={() => switchTo('signIn')}>Back to sign in</TextLink>
        )}
      </div>
    </form>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 text-muted underline">
      {children}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Emulator-only shortcut: one tap to sign in as any seeded role. */
function DevSignIn({ onError }: { onError: (msg: string) => void }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border-2 border-dashed border-locked-shadow p-4">
      <h2 className="text-sm font-black text-muted">EMULATOR · SIGN IN AS</h2>
      {DEV_USERS.map((u) => (
        <Button
          key={u.email}
          variant="ghost"
          caps={false}
          onClick={() =>
            signInWithEmailAndPassword(auth, u.email, DEV_PASSWORD).catch(() =>
              onError('Dev sign-in failed. Run `npm run seed` with the emulators running.'),
            )
          }
        >
          {u.name} · {ROLE_LABEL[u.role]}
        </Button>
      ))}
    </section>
  );
}
