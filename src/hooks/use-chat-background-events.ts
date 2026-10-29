import { useEffect } from 'react';
import type { BackgroundTask } from './use-background-tasks';

type RegisterTask = (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'status'> & { status?: BackgroundTask['status'] }) => unknown;

export function useChatBackgroundEvents(registerTask: RegisterTask) {
  useEffect(() => {
    const handleTaskEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { task?: Partial<BackgroundTask> & { taskId?: string; command?: string; tool?: string; device?: string; status?: BackgroundTask['status'] } } | undefined;
      const task = detail?.task;
      if (!task) return;
      registerTask({
        taskId: task.taskId,
        command: task.command || task.tool || 'Background task',
        tool: task.tool || 'runTerminalCommand',
        device: task.device,
        background: true,
        status: task.status || 'pending',
        resultText: task.resultText,
      });
    };

    window.addEventListener('jimskay-register-bg-task', handleTaskEvent);
    return () => window.removeEventListener('jimskay-register-bg-task', handleTaskEvent);
  }, [registerTask]);
}
