"use client"

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Download, Terminal, Shield, Sparkles, Cpu, Compass, Copy, Check, Share2, Trash2, FileText, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { jimskayChat } from '@/ai/flows/jimskay-chat-flow';
import { useToast } from '@/hooks/use-toast';
import type { ChatArtifact } from '@/lib/chat-artifacts';
import type { VisualLesson, VisualLessonVideoClip } from '@/lib/visual-lesson';
import { VisualLessonPlayer } from '@/components/VisualLessonPlayer';
import type { UniversalFileAttachment } from '@/lib/universal-file-workspace';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// 🧪 Crucial: Import the KaTeX CSS so the formulas are stylized beautifully!
// @ts-ignore
import 'katex/dist/katex.min.css';

function CodeBlock({ node, inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = async () => {
    const textToCopy = String(children).replace(/\n$/, '');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (inline || !match) {
    return (
      <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-primary" {...props}>
        {children}
      </code>
    );
  }

  return (
    <pre className="p-4 my-5 bg-black/40 rounded-xl border border-white/[0.06] text-[13px] font-mono leading-relaxed relative group whitespace-pre-wrap break-words overflow-x-hidden">
      {/* Copy utilities container */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 z-10">
        <span className="text-[9px] uppercase font-bold text-white/25 tracking-widest hidden sm:inline">
          {match[1]}
        </span>
        <button
          onClick={handleCopy}
          type="button"
          className="p-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-95"
          title="Copy Code"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <code className={className} {...props}>
        {children}
      </code>
    </pre>
  );
}

function PdfMarkdownLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = String(children).trim() || 'document.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF link download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDownloading}
      className="text-primary hover:underline font-semibold underline-offset-2 decoration-primary/40 transition-colors disabled:opacity-60"
    >
      {isDownloading ? 'Preparing download...' : children}
    </button>
  );
}

const markdownComponents = {
  code: CodeBlock,

  img: ({ src, alt }: any) => (
    <div className="relative my-5 rounded-xl overflow-hidden border border-white/10 max-w-md bg-black/20 shadow-lg">
      <img src={src} alt={alt || 'Visual Payload'} className="object-cover w-full h-auto max-h-[300px]" loading="lazy" />
    </div>
  ),

  a: ({ href, children }: any) => {
    const isPdf = href && /(?:\/api\/pdf\/|\.pdf(?:$|\?))/i.test(href);
    if (isPdf) return <PdfMarkdownLink href={href} children={children} />;

    const isDirectImage = href && /\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i.test(href);
    if (isDirectImage) {
      return (
        <div className="relative my-5 rounded-xl overflow-hidden border border-white/10 max-w-md bg-black/20 shadow-lg">
          <img src={href} alt="Sourced Payload" className="object-cover w-full h-auto max-h-[300px]" loading="lazy" />
        </div>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold underline-offset-2 decoration-primary/40 transition-colors">
        {children}
      </a>
    );
  },

  // FIXED: <div> instead of <p> to avoid nested-paragraph hydration errors
  p: ({ node, ...props }: any) => (
    <div className="mb-4 leading-[1.75] whitespace-pre-wrap last:mb-0" {...props} />
  ),

  ul: ({ node, ...props }: any) => (
    <ul className="list-disc list-outside ml-5 mb-4 space-y-1.5 marker:text-primary/70" {...props} />
  ),

  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal list-outside ml-5 mb-4 space-y-1.5 marker:text-primary/70" {...props} />
  ),

  li: ({ node, ...props }: any) => (
    <li className="leading-[1.75] pl-1" {...props} />
  ),

  table: ({ node, ...props }: any) => (
    <div className="overflow-x-auto my-5 rounded-xl border border-white/[0.08]">
      <table className="min-w-full border-collapse text-sm" {...props} />
    </div>
  ),

  thead: ({ node, ...props }: any) => (
    <thead className="bg-white/[0.04] border-b border-white/10 text-white/80" {...props} />
  ),

  th: ({ node, ...props }: any) => (
    <th className="px-4 py-3 font-semibold text-left tracking-wide text-[12px] uppercase" {...props} />
  ),

  td: ({ node, ...props }: any) => (
    <td className="px-4 py-3 border-t border-white/[0.05] text-[13px] leading-relaxed" {...props} />
  ),

  h1: ({ node, ...props }: any) => <h1 className="text-[22px] font-bold mt-7 mb-4 text-white tracking-tight" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="text-[19px] font-bold mt-6 mb-3 text-white tracking-tight" {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="text-[16px] font-bold mt-5 mb-2.5 text-white/90 tracking-tight" {...props} />,
  h4: ({ node, ...props }: any) => <h4 className="text-[14.5px] font-bold mt-4 mb-2 text-white/90 tracking-tight" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="my-5 border-l-2 border-primary/50 pl-4 text-white/60 italic" {...props} />
  ),
  hr: ({ node, ...props }: any) => <hr className="my-6 border-white/[0.07]" {...props} />,
};

interface ChatMessageProps {
  id?: string;
  chatId?: string;
  type?: string;
  role: 'user' | 'model';
  text: string;
  pdfPayload?: { base64Data?: string; downloadUrl?: string; filename: string } | null;
  fileAttachment?: UniversalFileAttachment | null;
  updatedFile?: UniversalFileAttachment | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  artifact?: ChatArtifact | null;
  visualLesson?: VisualLesson | null;
  videoClips?: VisualLessonVideoClip[] | null;
}

type PdfPayload = { base64Data?: string; downloadUrl?: string; filename: string };


function MessageActions({ id, chatId, role, text }: { id?: string; chatId?: string; role: 'user' | 'model'; text: string }) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Message copied' });
    } catch (error) {
      console.error('Failed to copy message:', error);
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Clipboard access is unavailable.' });
    }
  };

  const handleShare = async () => {
    const title = role === 'user' ? 'My message' : 'Jimskay AI response';
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Message copied for sharing' });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to share message:', error);
      toast({ variant: 'destructive', title: 'Share failed', description: 'This device could not share or copy the message.' });
    }
  };

  const handleDelete = async () => {
    if (!user || !db || !chatId || !id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId, 'messages', id));
      toast({ title: 'Message deleted' });
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast({ variant: 'destructive', title: 'Delete failed', description: 'The message could not be deleted.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`mt-2 flex items-center gap-1 ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <button type="button" onClick={handleCopy} title="Copy message" aria-label="Copy message" className="rounded-md p-2 text-white/40 transition hover:bg-white/10 hover:text-white">
        <Copy className="h-4 w-4" />
      </button>
      <button type="button" onClick={handleShare} title="Share message" aria-label="Share message" className="rounded-md p-2 text-white/40 transition hover:bg-white/10 hover:text-white">
        <Share2 className="h-4 w-4" />
      </button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button type="button" title="Delete message" aria-label="Delete message" className="rounded-md p-2 text-white/40 transition hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes this message from the chat history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ id, chatId, type, role, text, pdfPayload, fileAttachment, updatedFile, imageUrl, imageUrls, artifact, visualLesson, videoClips }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongUserMessage = role === 'user' && text.length > 250;
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const pdfLinkMatch = text.match(/\[([^\]]+\.pdf)\]\((https?:\/\/[^)\s]+|\/api\/pdf\/[^)\s]+)\)/i);
  const detectedPdfPayload: PdfPayload | null = pdfLinkMatch
    ? { filename: pdfLinkMatch[1], downloadUrl: pdfLinkMatch[2] }
    : null;
  const effectivePdfPayload: PdfPayload | null = pdfPayload || detectedPdfPayload;
  const renderedText = pdfLinkMatch
    ? text.replace(/(?:👉\s*)?\[[^\]]+\.pdf\]\((?:https?:\/\/|\/api\/pdf\/)[^)\s]+\)/i, '').replace(/\n{3,}/g, '\n\n').trim()
    : text;
  const artifactMarker = '[VISUAL_ARTIFACT_PLACEHOLDER]';
  const textSegments = renderedText.split(artifactMarker);
  const beforeArtifactText = textSegments[0]?.trim() ?? '';
  const afterArtifactText = textSegments.slice(1).join(artifactMarker).trim();
  const [revealedBeforeText, setRevealedBeforeText] = useState('');
  const [revealedAfterText, setRevealedAfterText] = useState('');
  const [showArtifact, setShowArtifact] = useState(false);

  useEffect(() => {
    if (role !== 'model') {
      setRevealedBeforeText(beforeArtifactText);
      setRevealedAfterText(afterArtifactText);
      setShowArtifact(Boolean(artifact));
      return;
    }

    const timeouts: number[] = [];
    const splitIntoChunks = (value: string) => {
      const normalized = value.replace(/\r\n/g, '\n').trim();
      if (!normalized) return [];

      const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
      const chunks: string[] = [];

      for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        if (!trimmed) continue;

        if (/^(?:\s*(?:[-*+]\s+|\d+\.\s+)|\s*#{1,6}\s+)/m.test(trimmed)) {
          chunks.push(trimmed);
          continue;
        }

        const sentences = trimmed.split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean);
        if (sentences.length > 1) {
          chunks.push(...sentences);
        } else {
          chunks.push(trimmed);
        }
      }

      return chunks.length ? chunks : [normalized];
    };

    const revealText = (source: string, setter: React.Dispatch<React.SetStateAction<string>>, delayMs = 45) => {
      const chunks = splitIntoChunks(source);
      if (!chunks.length) {
        setter('');
        return;
      }

      let index = 0;
      const tick = () => {
        index += 1;
        setter(chunks.slice(0, index).join('\n\n'));
        if (index < chunks.length) {
          timeouts.push(window.setTimeout(tick, delayMs));
        }
      };

      timeouts.push(window.setTimeout(tick, delayMs));
    };

    setRevealedBeforeText('');
    setRevealedAfterText('');
    setShowArtifact(false);

    if (beforeArtifactText) {
      revealText(beforeArtifactText, setRevealedBeforeText);
      const revealArtifactDelay = (splitIntoChunks(beforeArtifactText).length + 1) * 45;
      timeouts.push(window.setTimeout(() => {
        setShowArtifact(Boolean(artifact));
        if (afterArtifactText) {
          revealText(afterArtifactText, setRevealedAfterText);
        }
      }, revealArtifactDelay));
    } else if (artifact) {
      setShowArtifact(true);
      if (afterArtifactText) {
        revealText(afterArtifactText, setRevealedAfterText);
      }
    } else {
      revealText(renderedText, setRevealedBeforeText);
    }

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [artifact, afterArtifactText, beforeArtifactText, renderedText, role]);

  const handleDownload = async () => {
    if (!effectivePdfPayload?.downloadUrl && !effectivePdfPayload?.base64Data) return;
    setIsDownloading(true);
    try {
      if (effectivePdfPayload.downloadUrl) {
        const response = await fetch(effectivePdfPayload.downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed (${response.status})`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = effectivePdfPayload.filename || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      if (!effectivePdfPayload.base64Data) return;
      const binaryString = window.atob(effectivePdfPayload.base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = effectivePdfPayload.filename || 'schedule.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'This document link may have expired. Generate the PDF again and try once more.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTextFile = async (file: UniversalFileAttachment) => {
    try {
      if (file.downloadUrl) {
        const response = await fetch(file.downloadUrl);
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return;
      }
      const blob = new Blob([file.content || ''], { type: file.mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('File download failed:', error);
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'The file link may have expired. Generate the updated file again.',
      });
    }
  };

  const handleModeSwitch = async (mode: string) => {
    if (!db || !user || !chatId) return;
    setIsSwitching(mode);

    try {
      const userMsgRef = collection(db, 'users', user.uid, 'chats', chatId, 'messages');
      await addDoc(userMsgRef, {
        role: 'user',
        content: `jimskay operation change to ${mode} mode`,
        timestamp: serverTimestamp(),
      });

      const chatDocRef = doc(db, 'users', user.uid, 'chats', chatId);
      await updateDoc(chatDocRef, {
        activeMode: mode,
        lastMessage: `Mode shifted: ${mode.toUpperCase()}`,
        updatedAt: serverTimestamp(),
      });

      const response = await jimskayChat({
        userId: user.uid,
        activeMode: mode,
        history: [{ role: 'user', content: `Confirming system migration to ${mode} mode.` }],
      });

      await addDoc(userMsgRef, {
        role: 'model',
        content: response.text || `System migrated. Mode configured to ${mode.toUpperCase()}. Ready to execute tasks.`,
        timestamp: serverTimestamp(),
      });

      toast({ title: 'System Overclocked', description: `Active Node: ${mode.toUpperCase()}` });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Redirect Failed' });
    } finally {
      setIsSwitching(null);
    }
  };

  if (role === 'user') {
    return (
      <div className="flex flex-col items-end w-full">
        {fileAttachment && (
          <button
            type="button"
            onClick={() => handleDownloadTextFile(fileAttachment)}
            className="mb-2 flex max-w-[88%] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/[0.08]"
            title="Download original attachment"
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{fileAttachment.name}</span>
            <Download className="h-4 w-4 shrink-0 text-white/45" />
          </button>
        )}
        <div
          className={`msg-user w-full max-w-[88%] shadow-sm overflow-hidden ${
            isLongUserMessage && !isExpanded ? 'max-h-[120px]' : ''
          } ${type === 'mode-selector' ? 'hidden' : ''}`}
        >
          <div
            className={`relative transition-all duration-300 overflow-hidden ${
              isLongUserMessage && !isExpanded ? 'max-h-[120px]' : 'max-h-[5000px]'
            }`}
          >
            <div className="whitespace-pre-wrap break-normal">{text}</div>
            {isLongUserMessage && !isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0c0d24] to-transparent" />
            )}
          </div>
          {isLongUserMessage && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1.5 text-[11px] font-semibold text-white/50 hover:text-white/90 transition-colors"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <MessageActions id={id} chatId={chatId} role={role} text={text} />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="relative text-white/90 text-[20px] sm:text-[22px] leading-[1.8]">
        {/* Model images (rare) */}
        {(imageUrls && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : []).map((img, index) => (
          <div key={`${img}-${index}`} className="relative mb-3 rounded-xl overflow-hidden border border-white/10 max-w-sm bg-black/20 shadow-md animate-in fade-in duration-300">
            <img src={img} alt="Uploaded Segment" className="object-cover w-full h-auto max-h-[240px]" />
          </div>
        ))}

        <div className="relative ai-prose w-full">
          {revealedBeforeText && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {revealedBeforeText}
            </ReactMarkdown>
          )}

          {visualLesson && <VisualLessonPlayer lesson={visualLesson} videoClips={videoClips || []} />}

          {artifact && showArtifact && <ChatArtifactPreview artifact={artifact} />}

          {revealedAfterText && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {revealedAfterText}
            </ReactMarkdown>
          )}
        </div>

        {/* PDF Downloader Section */}
        {effectivePdfPayload && (
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            variant="outline"
            className="mt-4 w-full flex items-center justify-center gap-2 py-5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-all duration-300 group rounded-xl"
          >
            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
            <span className="text-xs font-black uppercase tracking-widest">
              {isDownloading ? 'Compiling Payload...' : 'Download Document'}
            </span>
          </Button>
        )}

        {updatedFile && (
          <Button
            type="button"
            onClick={() => handleDownloadTextFile(updatedFile)}
            variant="outline"
            className="mt-4 w-full flex items-center justify-center gap-2 py-5 border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15 hover:text-emerald-200 rounded-xl"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">Download updated {updatedFile.name}</span>
            <Download className="h-4 w-4 shrink-0" />
          </Button>
        )}

        {/* Interactive Mode Selection Matrix */}
        {type === 'mode-selector' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5 border-t border-white/5 pt-4">
            <button
              onClick={() => handleModeSwitch('normal')}
              disabled={isSwitching !== null}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 text-left transition-all active:scale-95 group"
            >
              <Compass className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-all" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Normal</div>
                <div className="text-[8px] text-muted-foreground font-bold uppercase">Standard Protocol</div>
              </div>
            </button>

            <button
              onClick={() => handleModeSwitch('hacking')}
              disabled={isSwitching !== null}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/20 text-left transition-all active:scale-95 group"
            >
              <Shield className="w-5 h-5 text-red-500 group-hover:scale-110 transition-all" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-red-500">Hacking</div>
                <div className="text-[8px] text-muted-foreground font-bold uppercase">Cyber Shield &amp; Audit</div>
              </div>
            </button>

            <button
              onClick={() => handleModeSwitch('creator')}
              disabled={isSwitching !== null}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/20 text-left transition-all active:scale-95 group"
            >
              <Sparkles className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-all" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Creator</div>
                <div className="text-[8px] text-muted-foreground font-bold uppercase">Creative Injector</div>
              </div>
            </button>

            <button
              onClick={() => handleModeSwitch('programming')}
              disabled={isSwitching !== null}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-amber-500/10 hover:border-amber-500/20 text-left transition-all active:scale-95 group"
            >
              <Cpu className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-all" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-500">Programming</div>
                <div className="text-[8px] text-muted-foreground font-bold uppercase">Syntax Engine</div>
              </div>
            </button>

            <button
              onClick={() => handleModeSwitch('religious')}
              disabled={isSwitching !== null}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-yellow-400/10 hover:border-yellow-400/20 text-left transition-all active:scale-95 group sm:col-span-2"
            >
              <Terminal className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-all animate-pulse" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Religious</div>
                <div className="text-[8px] text-muted-foreground font-bold uppercase">Spiritual Wisdom &amp; Contemplation</div>
              </div>
            </button>
          </div>
        )}
      </div>
      <MessageActions id={id} chatId={chatId} role={role} text={text} />
    </div>
  );
};

function ChatArtifactPreview({ artifact }: { artifact: ChatArtifact }) {
  const [previewHeight, setPreviewHeight] = useState(artifact.kind === 'svg' ? 260 : 360);
  const [frameId] = useState(() => `artifact-${Math.random().toString(36).slice(2)}`);
  const contentSecurityPolicy = artifact.kind === 'svg'
    ? "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-src 'none'; object-src 'none';"
    : "default-src 'none'; base-uri 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none';";
  const documentSource = artifact.kind === 'svg'
    ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"></head><body style="margin:0;padding:16px;background:#101116;display:flex;align-items:center;justify-content:center;">${artifact.code}</body></html>`
    : artifact.code.match(/<html[\s>]/i)
        ? artifact.code
          .replace(/<head\s*>/i, `<head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"><style>html,body{margin:0;max-width:100%;overflow-x:hidden}canvas,svg{display:block;max-width:100%;height:auto}</style><script>new ResizeObserver(()=>parent.postMessage({type:'jimskay-artifact-height',id:'${frameId}',height:document.documentElement.scrollHeight},'*')).observe(document.documentElement);</script>`)
          .replace(/<html([^>]*)>/i, (tag) => tag.includes('<head') ? tag : tag)
          .replace(/(<html[^>]*>)(?![\s\S]*<head\s*>)/i, `$1<head><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"></head>`)
      : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"><style>html,body{margin:0;max-width:100%;overflow-x:hidden}canvas,svg{display:block;max-width:100%;height:auto}</style><script>new ResizeObserver(()=>parent.postMessage({type:'jimskay-artifact-height',id:'${frameId}',height:document.documentElement.scrollHeight},'*')).observe(document.documentElement);</script></head><body>${artifact.code}</body></html>`;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'jimskay-artifact-height' || event.data.id !== frameId) return;
      const nextHeight = Math.max(180, Math.min(520, Number(event.data.height) + 8));
      if (Number.isFinite(nextHeight)) setPreviewHeight(nextHeight);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frameId]);

  const downloadArtifact = () => {
    const blob = new Blob([artifact.code], { type: artifact.kind === 'svg' ? 'image/svg+xml;charset=utf-8' : 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(artifact.title || 'jimskay-visual').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'visual'}.${artifact.kind === 'svg' ? 'svg' : 'html'}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openArtifact = () => {
    const blob = new Blob([documentSource], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-primary/20 bg-black/20 shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Interactive visual</div>
          {artifact.title && <div className="mt-0.5 truncate text-xs text-white/60">{artifact.title}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden sm:inline text-[9px] uppercase tracking-widest text-white/30">{artifact.kind}</span>
          <button type="button" onClick={openArtifact} title="Open visual in a new tab" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={downloadArtifact} title="Download visual" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <iframe
        title={artifact.title || 'AI generated visual'}
        srcDoc={documentSource}
        sandbox={artifact.kind === 'html' ? 'allow-scripts' : ''}
        style={{ height: `${previewHeight}px` }}
        className="block w-full border-0 bg-[#101116]"
      />
    </div>
  );
}