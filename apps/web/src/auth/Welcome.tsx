import { useState, type FormEvent } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { claimInvite, createCompany, messageOf, refreshClaims } from '../admin/api';
import { auth } from '../lib/firebase';
import { Brix } from '../ui/Brix';
import { Button } from '../ui/Button';
import { ErrorNote, TextField } from '../ui/Field';
import { useAuth } from './AuthProvider';

/** Signed in, but not in a company yet: claim an invite, or set up a new company. */
export function Welcome() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [setup, setSetup] = useState(false);
  const [companyName, setCompanyName] = useState('');
  // Null until edited, so it picks up the account name even if that arrives a moment late.
  const [editedName, setYourName] = useState<string | null>(null);

  if (!user) return null;
  const firstName = (user.displayName ?? '').split(' ')[0];
  const yourName = editedName ?? user.displayName ?? '';

  async function checkInvite() {
    setBusy(true);
    setError('');
    try {
      // A just-verified email only shows up in the token after a reload.
      await user!.reload();
      await auth.currentUser?.getIdToken(true);
      await claimInvite();
      await refreshClaims();
    } catch (err) {
      if ((err as { details?: { reason?: string } }).details?.reason === 'unverified') {
        setNeedsVerify(true);
        setError('');
      } else {
        setError(messageOf(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendVerify() {
    setError('');
    try {
      await sendEmailVerification(user!);
      setVerifySent(true);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function makeCompany(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createCompany({ companyName: companyName.trim(), yourName: yourName.trim() });
      await refreshClaims();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col gap-5 px-5 pt-[max(40px,env(safe-area-inset-top))] pb-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Brix size={100} />
        <h1 className="text-2xl font-black">Welcome{firstName ? `, ${firstName}` : ''}!</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-card border-2 border-card-line bg-white p-4">
        <h2 className="text-lg font-black">Joining your team?</h2>
        <p className="text-muted">
          Ask your company admin to invite <strong className="font-black text-ink">{user.email}</strong>, then tap below.
        </p>
        {needsVerify && (
          <div className="flex flex-col gap-2 rounded-btn bg-cream p-3">
            <p className="font-bold">First, confirm this email is yours.</p>
            {verifySent ? (
              <p className="text-sm text-muted">We sent you a link. Open it, then tap “Check for my invite”.</p>
            ) : (
              <Button variant="ghost" caps={false} onClick={() => void sendVerify()}>
                Send me a confirmation email
              </Button>
            )}
          </div>
        )}
        <Button onClick={() => void checkInvite()} disabled={busy}>
          {busy && !setup ? 'Checking…' : 'Check for my invite'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-card border-2 border-card-line bg-white p-4">
        <h2 className="text-lg font-black">Setting up your company?</h2>
        {setup ? (
          <form onSubmit={(e) => void makeCompany(e)} className="flex flex-col gap-3">
            <TextField label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" />
            <TextField label="Your name" value={yourName} onChange={(e) => setYourName(e.target.value)} autoComplete="name" />
            <p className="text-sm text-muted">You’ll be the admin: you add projects, zones and people.</p>
            <Button type="submit" variant="ink" disabled={busy || !companyName.trim() || !yourName.trim()}>
              {busy ? 'Setting up…' : 'Create company'}
            </Button>
          </form>
        ) : (
          <Button variant="ghost" caps={false} onClick={() => setSetup(true)}>
            Create a new company
          </Button>
        )}
      </section>

      <ErrorNote>{error}</ErrorNote>

      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </main>
  );
}
