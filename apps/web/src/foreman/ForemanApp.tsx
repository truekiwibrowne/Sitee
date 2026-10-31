import { useEffect, useState } from 'react';
import type { Task } from '@site-streak/shared';
import { ReportForm } from '../report/ReportForm';
import { usePhotoUploader } from '../report/uploader';
import { BottomNav, type Tab } from '../shell/BottomNav';
import { ComingSoon, MeScreen } from '../shell/SimpleScreens';
import { TodayScreen } from './TodayScreen';

/** The foreman's app: Today, Learn, League and Me tabs, plus the report form. */
export function ForemanApp({ orgId, uid }: { orgId: string; uid: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [openTask, setOpenTask] = useState<(Task & { id: string }) | null>(null);
  usePhotoUploader();

  // Each screen opens at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [openTask, tab]);

  return (
    <>
      {/* Today stays mounted under the form, so it sees the report land and celebrates. */}
      <div className={`mx-auto min-h-dvh max-w-[430px] flex-col ${openTask ? 'hidden' : 'flex'}`}>
        <main className="flex flex-1 flex-col pt-[env(safe-area-inset-top)]">
          {tab === 'today' && <TodayScreen orgId={orgId} uid={uid} onOpenTask={setOpenTask} />}
          {tab === 'learn' && <ComingSoon title="Learn" blurb="Lessons your site manager assigns will show up here." />}
          {tab === 'league' && <ComingSoon title="League" blurb="This week’s league table is on its way." />}
          {tab === 'me' && <MeScreen />}
        </main>
        <BottomNav active={tab} onChange={setTab} />
      </div>
      {openTask && (
        <ReportForm
          orgId={orgId}
          uid={uid}
          task={openTask}
          onBack={() => setOpenTask(null)}
          onSent={() => {
            setOpenTask(null);
            setTab('today');
          }}
        />
      )}
    </>
  );
}
