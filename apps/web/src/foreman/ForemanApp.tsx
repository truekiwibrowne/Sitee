import { useState } from 'react';
import type { Task } from '@site-streak/shared';
import { BottomNav, type Tab } from '../shell/BottomNav';
import { ComingSoon, MeScreen, TaskPlaceholder } from '../shell/SimpleScreens';
import { TodayScreen } from './TodayScreen';

/** The foreman's app: Today, Learn, League and Me tabs. */
export function ForemanApp({ orgId, uid }: { orgId: string; uid: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [openTask, setOpenTask] = useState<(Task & { id: string }) | null>(null);

  if (openTask) return <TaskPlaceholder task={openTask} onBack={() => setOpenTask(null)} />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
      <main className="flex flex-1 flex-col pt-[env(safe-area-inset-top)]">
        {tab === 'today' && <TodayScreen orgId={orgId} uid={uid} onOpenTask={setOpenTask} />}
        {tab === 'learn' && <ComingSoon title="Learn" blurb="Lessons your site manager assigns will show up here." />}
        {tab === 'league' && <ComingSoon title="League" blurb="This week’s league table is on its way." />}
        {tab === 'me' && <MeScreen />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
