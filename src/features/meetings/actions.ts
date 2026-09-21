'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { Meeting } from './types';
import type { Task } from '@/features/today/types';
import { todayIso } from '@/lib/tz/today';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

export async function addMeeting(clientId: string, formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const title = String(formData.get('title') ?? '').trim();
  const starts_at = String(formData.get('starts_at') ?? '').trim();
  if (!title || !starts_at) return;

  await table<Meeting>('meetings').insert({
    id: newId(),
    owner_id,
    client_id: clientId,
    project_id: String(formData.get('project_id') ?? '').trim() || null,
    title,
    starts_at,
    duration_mins: Number(formData.get('duration_mins') ?? 30) || 30,
    location: String(formData.get('location') ?? '').trim() || null,
    attendees: String(formData.get('attendees') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
    follow_up: null,
    created_at: new Date().toISOString(),
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function updateMeetingNotes(clientId: string, meetingId: string, formData: FormData): Promise<void> {
  await requireOwner();
  await table<Meeting>('meetings').update(meetingId, {
    notes: String(formData.get('notes') ?? '').trim() || null,
    follow_up: String(formData.get('follow_up') ?? '').trim() || null,
  });
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Turn a meeting's follow-up line into a real task. Follow-ups that live
 * only in meeting notes are follow-ups that don't happen.
 */
export async function followUpToTask(clientId: string, meetingId: string): Promise<void> {
  const owner_id = await requireOwner();
  const meeting = await table<Meeting>('meetings').find(meetingId);
  if (!meeting?.follow_up) return;

  await table<Task>('tasks').insert({
    id: newId(),
    owner_id,
    project_id: meeting.project_id,
    title: meeting.follow_up,
    dump_date: todayIso(),
    scheduled_date: null,
    scheduled_hour: null,
    duration_hours: 1,
    done: false,
    created_at: new Date().toISOString(),
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/today');
}

export async function deleteMeeting(clientId: string, meetingId: string): Promise<void> {
  await requireOwner();
  await table<Meeting>('meetings').remove(meetingId);
  revalidatePath(`/clients/${clientId}`);
}
