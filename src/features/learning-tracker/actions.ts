'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { relinkNeed } from '@/features/reward-vault/actions';
import { courseStatus } from './types';
import type { Course } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(): string {
  return `course_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function addCourse(formData: FormData): Promise<{ error?: string }> {
  const owner = await requireOwner();
  const title = String(formData.get('title') ?? '').trim();
  const provider = String(formData.get('provider') ?? '').trim();
  const totalLessons = Number(formData.get('total_lessons') ?? 0);
  const topic = String(formData.get('topic_tag') ?? '').trim();
  const linkNeedId = String(formData.get('link_need_id') ?? '').trim();

  if (!title || !provider || !Number.isFinite(totalLessons) || totalLessons <= 0) {
    return { error: 'Fill in a name, provider and a total lesson count.' };
  }

  const id = newId();
  await table<Course>('courses').insert({
    id,
    owner_id: owner,
    title,
    provider,
    topic_tags: topic ? [topic] : [],
    total_lessons: totalLessons,
    completed_lessons: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
  });

  if (linkNeedId) {
    const result = await relinkNeed(linkNeedId, (() => {
      const fd = new FormData();
      fd.set('source_type', 'course');
      fd.set('source_id', id);
      return fd;
    })());
    if (result.error) {
      // The course itself was still created — just leave the need
      // unlinked and surface why, rather than rolling back a perfectly
      // good course row over an optional link failing its own rules.
      revalidatePath('/learning-tracker');
      return { error: `Course added, but couldn't link the reward: ${result.error}` };
    }
  }

  revalidatePath('/learning-tracker');
  revalidatePath('/reward-vault');
  return {};
}

/**
 * The only way lesson counts (and therefore status and completed_at) ever
 * change — never let the UI set status directly, or a lesson-count update
 * and status can drift out of sync.
 */
export async function updateLessonProgress(courseId: string, completedLessons: number): Promise<void> {
  await requireOwner();
  const course = await table<Course>('courses').find(courseId);
  if (!course) return;

  const clamped = Math.max(0, Math.min(course.total_lessons, Math.round(completedLessons)));
  const wasCompleted = courseStatus(course) === 'completed';
  const nowCompleted = clamped >= course.total_lessons;

  await table<Course>('courses').update(courseId, {
    completed_lessons: clamped,
    completed_at: nowCompleted ? (course.completed_at ?? new Date().toISOString().slice(0, 10)) : (wasCompleted ? course.completed_at : null),
  });

  revalidatePath('/learning-tracker');
  revalidatePath('/reward-vault'); // a course reaching completed may unlock a linked Need on next reconciliation
}

export async function deleteCourse(courseId: string): Promise<void> {
  await requireOwner();
  await table<Course>('courses').remove(courseId);
  revalidatePath('/learning-tracker');
}
