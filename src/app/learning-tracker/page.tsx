import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getCourses, getLearningStats } from '@/features/learning-tracker/queries';
import { getRelinkableNeeds } from '@/features/reward-vault/queries';
import { LearningTrackerClient } from '@/features/learning-tracker/components/LearningTrackerClient';
import { Shell } from '@/components/Shell';

export default async function LearningTrackerPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const [courses, stats, needOptions] = await Promise.all([
    getCourses(email),
    getLearningStats(email),
    getRelinkableNeeds(email),
  ]);

  return (
    <Shell active="learning-tracker" title="Learning Tracker" crumb="Personal">
      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="lbl">In progress</div><div className="val">{stats.inProgress}</div></div>
        <div className="stat"><div className="lbl">Completed this year</div><div className="val pos">{stats.completedThisYear}</div></div>
        <div className="stat"><div className="lbl">Total courses</div><div className="val">{courses.length}</div></div>
      </div>
      <LearningTrackerClient courses={courses} needOptions={needOptions} />
    </Shell>
  );
}
