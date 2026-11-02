import { useEffect, useState } from 'react';
import type { Task } from '@site-streak/shared';
import { SubmissionView } from '../history/History';
import { ReportForm } from '../report/ReportForm';
import { ReviewScreen } from './ReviewScreen';
import { usePhotoUploader } from '../report/uploader';
import { BottomNav, FOREMAN_TABS, type ForemanTab } from '../shell/BottomNav';
import { ComingSoon, MeScreen } from '../shell/SimpleScreens';
import { TodayScreen } from './TodayScreen';

/** The app for everyone who does the work (foremen up to construction managers): Today with
 * their tasks and reviews, Learn, League and Me, plus the report form, reviews and past reports. */
export function WorkerApp({ orgId, uid }: { orgId: string; uid: string }) {
  const [tab, setTab] = useState<ForemanTab>('today');
  const [openTask, setOpenTask] = useState<(Task & { id: string }) | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<(Task & { id: string }) | null>(null);
  usePhotoUploader();

  // Each screen opens at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [openTask, viewing, reviewing, tab]);

  const overlay = openTask ? (
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
  ) : reviewing ? (
    <ReviewScreen
      orgId={orgId}
      uid={uid}
      reviewTask={reviewing}
      onBack={() => setReviewing(null)}
      onDone={() => {
        setReviewing(null);
        setTab('today');
      }}
    />
  ) : viewing ? (
    <SubmissionView orgId={orgId} uid={uid} submissionId={viewing} onBack={() => setViewing(null)} />
  ) : null;

  return (
    <>
      {/* Today stays mounted under the form, so it sees the report land and celebrates. */}
      <div className={`mx-auto min-h-dvh max-w-[430px] flex-col ${overlay ? 'hidden' : 'flex'}`}>
        <main className="flex flex-1 flex-col pt-[env(safe-area-inset-top)]">
          {tab === 'today' && <TodayScreen orgId={orgId} uid={uid} onOpenTask={setOpenTask} onViewSubmission={setViewing} onReview={setReviewing} />}
          {tab === 'learn' && <ComingSoon title="Learn" blurb="Lessons your site manager assigns will show up here." />}
          {tab === 'league' && <ComingSoon title="League" blurb="This week’s league table is on its way." />}
          {tab === 'me' && <MeScreen onOpenSubmission={setViewing} />}
        </main>
        <BottomNav tabs={FOREMAN_TABS} active={tab} onChange={setTab} />
      </div>
      {overlay}
    </>
  );
}
