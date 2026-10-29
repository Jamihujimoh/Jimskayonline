'use server';

import { getAdminTask, listAdminTasks, type AdminTaskState } from '@/ai/lib/admin-task-state';

export async function checkAdminTask(taskId: string): Promise<AdminTaskState | null> {
  return getAdminTask(taskId);
}

export async function recentAdminTasks(limit = 20): Promise<AdminTaskState[]> {
  return listAdminTasks(limit);
}
