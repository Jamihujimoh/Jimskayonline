export type AdminToolStatus = 'running' | 'success' | 'error';

export interface AdminToolStep {
  ref: string;
  type: 'tool';
  name: string;
  input: any;
  output?: any;
  status: AdminToolStatus;
}

export interface AdminTextStep {
  type: 'text';
  content: string;
}

export type AdminStep = AdminToolStep | AdminTextStep;

export interface AdminChatResult {
  steps: AdminStep[];
  text: string;
  taskId?: string;
}
