export type AttachmentPipelineStatus = 'ready' | 'inspecting' | 'uploading' | 'packaging' | 'error';

export type AttachmentUiState = {
  status: AttachmentPipelineStatus;
  message?: string;
  sourceLabel?: string;
  fileCount?: number;
};

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function extensionLabel(name: string): string {
  const clean = name.split(/[\\/]/).pop() || name;
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).toUpperCase() : 'FILE';
}

export function folderNameFromFiles(files: File[]): string {
  const first = files[0] as (File & { webkitRelativePath?: string }) | undefined;
  return first?.webkitRelativePath?.split('/')[0] || first?.name || 'Folder';
}
