"use client"

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Code2,
  Save,
  ArrowLeft,
  Loader2,
  FileCode,
  Play,
  MessageSquare,
  X,
  Download,
  Plus,
  Trash2,
  FilePlus2,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-python';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  createStudioFile,
  normalizeStudioFiles,
  replaceStudioFile,
  removeStudioFile,
  type StudioFile,
  type StudioLanguage,
} from '@/lib/studio';

export default function JimskayWorkspacePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [tempCode, setTempCode] = useState('');
  const [savedCode, setSavedCode] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'html' | 'css' | 'javascript' | 'python'>('html');
  const [isAddingFile, setIsAddingFile] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const projectDocQuery = useMemoFirebase(() => {
    if (!db || !user || !projectId) return null;
    return doc(db, 'users', user.uid, 'projects', projectId);
  }, [db, user?.uid, projectId]);

  const { data: project, isLoading } = useDoc(projectDocQuery);

  const files = normalizeStudioFiles(project?.files);
  const isDirty = tempCode !== savedCode;

  useEffect(() => {
    const nextFile = files[activeFileIndex] || files[0];
    if (nextFile) {
      setTempCode(nextFile.content);
      setSavedCode(nextFile.content);
    }
  }, [project?.id, project?.updatedAt, activeFileIndex]);

  const persistFiles = async (nextFiles: StudioFile[], successMessage = 'Project files updated.', notify = true) => {
    if (!user || !db || !project) return;
    setIsSaving(true);
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    try {
      await updateDoc(docRef, { files: nextFiles, updatedAt: serverTimestamp() });
      setSavedCode(nextFiles[activeFileIndex]?.content ?? '');
      if (notify) toast({ title: 'Saved', description: successMessage });
    } catch (err) {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: { files },
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({ variant: 'destructive', title: 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isDirty || !project || !user || !db) return;
    const timer = window.setTimeout(() => {
      persistFiles(replaceStudioFile(files, activeFileIndex, tempCode), 'Changes saved automatically.', false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tempCode]);

  const handleSave = () => {
    if (!project || !isDirty) return;
    persistFiles(replaceStudioFile(files, activeFileIndex, tempCode));
  };

  const handleSelectFile = (index: number) => {
    if (index === activeFileIndex) return;
    if (isDirty && !window.confirm('Discard unsaved changes to this file?')) return;
    setActiveFileIndex(index);
  };

  const handleDownloadFile = () => {
    if (!project?.files?.[activeFileIndex]) return;
    const activeFile = files[activeFileIndex];
    const blob = new Blob([tempCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: `${activeFile.name} saved to your device.` });
  };

  const handleAddFile = async () => {
    if (!project || !newFileName.trim()) return;
    const newFile = createStudioFile(newFileName, newFileType);
    setIsAddingFile(true);
    try {
      const nextFiles = [...replaceStudioFile(files, activeFileIndex, tempCode), newFile];
      await persistFiles(nextFiles, `${newFile.name} added to the project.`);
      setActiveFileIndex(nextFiles.length - 1);
      setNewFileName('');
      setShowNewFile(false);
    } finally {
      setIsAddingFile(false);
    }
  };

  const handleDeleteFile = async (idx: number) => {
    if (!project || files.length <= 1) {
      toast({ variant: 'destructive', title: 'Cannot delete', description: 'A project needs at least one file.' });
      return;
    }
    const file = files[idx];
    if (!window.confirm(`Delete "${file.name}"?`)) return;
    const nextFiles = removeStudioFile(replaceStudioFile(files, activeFileIndex, tempCode), idx);
    await persistFiles(nextFiles, `${file.name} removed from the project.`);
    setActiveFileIndex(Math.min(Math.max(0, idx - 1), nextFiles.length - 1));
  };

  const highlightCode = (input: string, language: string) => {
    try {
      let lang = Prism.languages.markup;
      if (language === 'javascript' && Prism.languages.js) lang = Prism.languages.js;
      else if (language === 'css' && Prism.languages.css) lang = Prism.languages.css;
      else if (language === 'python' && Prism.languages.python) lang = Prism.languages.python;
      return Prism.highlight(input || '', lang, language);
    } catch {
      return input || '';
    }
  };

  if (!isMounted || isUserLoading || isLoading || !project) {
    return (
      <div className="h-screen w-screen app-bg flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="absolute -inset-20 bg-primary/20 rounded-full blur-[80px] animate-pulse" />
          <Loader2 className="w-16 h-16 text-primary animate-spin relative" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-primary animate-pulse">Loading Project</p>
      </div>
    );
  }

  const activeFile = files[activeFileIndex] || { name: 'index.html', language: 'html' as StudioLanguage, content: '' };
  const lines = tempCode.split('\n');

  return (
    <div className="h-[100dvh] w-screen app-bg text-white flex flex-col overflow-hidden font-sans">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-black/60 backdrop-blur-3xl shrink-0 z-[100]">
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push('/studio')} className="rounded-xl h-9 w-9 bg-white/5 text-primary hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white shadow-2xl glow-primary shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-sm md:text-lg font-black tracking-tighter uppercase italic leading-none shimmer-text truncate max-w-[140px] md:max-w-none">
                {project.name}
              </h1>
              <p className="text-[7px] font-black uppercase tracking-[0.4em] text-primary/60 mt-0.5 hidden md:block">Code Workspace</p>
            </div>
          </div>
        </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <span className={`hidden md:inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] ${isDirty ? 'text-amber-300' : 'text-primary/60'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isDirty ? 'bg-amber-300' : 'bg-primary'}`} />
              {isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
          <div className="hidden md:flex items-center gap-2">
            <Button
              onClick={() => router.push(`/studio/architect/${projectId}`)}
              className="h-10 rounded-xl bg-white/5 hover:bg-white/10 text-primary border border-primary/20 px-5 text-[10px] font-black uppercase tracking-widest gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              AI Architect
            </Button>
            <Button
              onClick={() => router.push(`/studio/view/${projectId}`)}
              className="h-10 rounded-xl bg-white/5 hover:bg-white/10 text-accent border border-accent/20 px-5 text-[10px] font-black uppercase tracking-widest gap-2"
            >
              <Play className="w-4 h-4" />
              Preview
            </Button>
          </div>

          <div className="w-px h-8 bg-white/10 hidden md:block" />

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownloadFile}
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-primary hover:bg-white/10"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl h-10 gradient-primary text-white font-black text-[9px] md:text-[10px] uppercase tracking-widest px-4 md:px-6 shadow-xl glow-primary border-none"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin md:mr-2" /> : <Save className="w-4 h-4 md:mr-2" />}
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden surface-dim">
        <div className="w-full md:w-60 border-r border-white/5 bg-black/40 flex-col shrink-0 z-40 hidden md:flex">
          <div className="h-10 px-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Files</span>
            <button
              onClick={() => setShowNewFile(true)}
              className="p-1 rounded-md hover:bg-white/10 text-primary transition-all"
              title="Add file"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
            {files.map((file: StudioFile, idx: number) => (
              <div
                key={file.name}
                onClick={() => handleSelectFile(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all group ${
                  activeFileIndex === idx ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/[0.03]'
                }`}
              >
                <FileCode className={`w-4 h-4 shrink-0 ${activeFileIndex === idx ? 'text-primary' : 'text-muted-foreground/30'}`} />
                <span className="text-[11px] font-bold tracking-tight truncate flex-1">{file.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFile(idx);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                  title="Delete file"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="h-11 flex items-center bg-black/40 border-b border-white/5 px-2 overflow-x-auto gap-0.5 shrink-0">
            {files.map((file: StudioFile, idx: number) => (
              <button
                key={idx}
                onClick={() => handleSelectFile(idx)}
                className={`h-full px-4 flex items-center gap-2 border-r border-white/5 transition-all relative group shrink-0 ${
                  activeFileIndex === idx
                    ? 'surface-dim text-primary after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary'
                    : 'text-white/30 hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">{file.name}</span>
              </button>
            ))}
            <button
              onClick={() => setShowNewFile(true)}
              className="ml-2 p-1.5 rounded-md text-primary/60 hover:text-primary hover:bg-white/5 shrink-0"
              title="Add file"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="editor-container">
            <div className="editor-gutter">
              {lines.map((_, i) => (
                <div key={i} className="gutter-number">{i + 1}</div>
              ))}
            </div>
            <div className="forge-editor-root">
              <Editor
                value={tempCode}
                onValueChange={setTempCode}
                highlight={(code) => highlightCode(code, activeFile.language)}
                padding={0}
                className="min-h-full"
                textareaId="forge-editor-textarea"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {showNewFile && (
            <div className="absolute top-14 right-4 z-50 glass-panel bg-black/90 border-white/10 rounded-2xl p-4 shadow-2xl w-72 animate-in zoom-in-95 duration-300 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">New File</span>
                <button onClick={() => setShowNewFile(false)} className="text-white/30 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
                placeholder="File name (e.g. app)"
                className="w-full rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white px-3 h-10 outline-none focus:border-primary/50"
              />
              <div className="flex gap-1.5">
                {(['html', 'css', 'javascript', 'python'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewFileType(t)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-wider border transition-all ${
                      newFileType === t
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'border-white/10 text-white/40 hover:text-white/70'
                    }`}
                  >
                    {t === 'javascript' ? 'JS' : t}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleAddFile}
                disabled={isAddingFile || !newFileName.trim()}
                className="w-full h-9 rounded-xl gradient-primary text-white font-black uppercase tracking-widest text-[9px] border-none glow-primary"
              >
                {isAddingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Add File
              </Button>
            </div>
          )}

          <div className="md:hidden h-16 bg-black/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-around px-4 shrink-0 z-50">
            <button onClick={handleSave} className="flex flex-col items-center gap-1 text-primary">
              <Save className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Save</span>
            </button>
            <button onClick={() => router.push(`/studio/view/${projectId}`)} className="flex flex-col items-center gap-1 text-white/20">
              <Play className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Run</span>
            </button>
            <button onClick={() => router.push(`/studio/architect/${projectId}`)} className="flex flex-col items-center gap-1 text-white/20">
              <MessageSquare className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">AI</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="h-8 bg-card border-t border-white/5 flex items-center px-6 shrink-0 overflow-hidden hidden md:flex">
        <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[8px] whitespace-nowrap">
          Jimskay Studio • Code Workspace • Auto-save enabled
        </span>
      </footer>
    </div>
  );
}
