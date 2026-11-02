import { collection, query, where } from 'firebase/firestore';
import { paths, taskSchema, type Task } from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useQueryData } from '../data/useFirestore';

/** Reports people sent you to review, from any day. */
export function useReviewsWaiting(orgId: string, uid: string) {
  const q = query(
    collection(db, paths.tasks(orgId)),
    where('assigneeId', '==', uid),
    where('kind', '==', 'review'),
    where('status', '==', 'open'),
  );
  return useQueryData(q, `${orgId}/${uid}/reviews`, taskSchema).data;
}

/** Hidden when there are none. */
export function ReviewsWaiting({ reviews, onReview }: { reviews: (Task & { id: string })[]; onReview: (task: Task & { id: string }) => void }) {
  if (reviews.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-card border-2 border-yellow bg-white p-4">
      <h2 className="text-lg font-black">
        Reports to review · {reviews.length}
      </h2>
      {reviews.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onReview(r)}
          className="press flex min-h-14 w-full items-center justify-between gap-3 rounded-btn border-2 border-card-line bg-cream px-4 py-2 text-left shadow-chunky-locked"
        >
          <span>
            <span className="block font-black">{r.title}</span>
            <span className="block text-sm text-muted">+{r.xp} XP for reviewing</span>
          </span>
          <span className="shrink-0 rounded-btn bg-ink px-3 py-2 text-sm font-black tracking-wider text-white">REVIEW</span>
        </button>
      ))}
    </section>
  );
}
