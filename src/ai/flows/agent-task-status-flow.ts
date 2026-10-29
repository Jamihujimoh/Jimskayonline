'use server';

import { getTaskStatus, type TaskStatus } from '@/ai/lib/local-agent-bridge';

/**
 * Client-callable server action that reads the live status of a background
 * local-agent task from the Realtime Database. Lets the chat UI resume
 * watching tasks after navigation, sleep, or a full app restart.
 */
export async function checkLocalAgentTask(taskId: string): Promise<TaskStatus> {
  return getTaskStatus(taskId);
}
