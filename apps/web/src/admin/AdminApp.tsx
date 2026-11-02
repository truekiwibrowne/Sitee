import { useEffect, useState } from 'react';
import { BottomNav, type NavTab } from '../shell/BottomNav';
import { MeScreen } from '../shell/SimpleScreens';
import { CompanyScreen } from './CompanyScreen';
import { PeopleScreen } from './PeopleScreen';

type AdminTab = 'company' | 'people' | 'me';

const ADMIN_TABS: NavTab<AdminTab>[] = [
  { id: 'company', label: 'Company', icon: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01' },
  { id: 'people', label: 'People', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-4-5.6' },
  { id: 'me', label: 'Me', icon: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0' },
];

/** The company admin's app: set up projects and zones, and manage people. */
export function AdminApp({ orgId, uid }: { orgId: string; uid: string }) {
  const [tab, setTab] = useState<AdminTab>('company');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
      <main className="flex flex-1 flex-col pt-[env(safe-area-inset-top)]">
        {tab === 'company' && <CompanyScreen orgId={orgId} />}
        {tab === 'people' && <PeopleScreen orgId={orgId} uid={uid} />}
        {tab === 'me' && <MeScreen />}
      </main>
      <BottomNav tabs={ADMIN_TABS} active={tab} onChange={setTab} />
    </div>
  );
}
