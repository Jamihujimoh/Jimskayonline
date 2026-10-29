"use client"

import { ChatMessage } from '@/components/ChatMessage';
import { AdminRunView } from '@/components/AdminRunView';
import { ThinkingBlock } from '@/components/ThinkingBlock';
import { ChatTodos, clearAiTodos, mergeAiTodos } from '@/components/ChatTodos';
import { useEffect, useRef } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualLesson } from '@/lib/visual-lesson';
import { parseVisualLessonMarker } from '@/lib/visual-lesson';

export function MessageList({ chatId, isAiThinking }: { chatId: string | null; isAiThinking?: boolean }) {
  const { user } = useUser();
  const db = useFirestore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const profileQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc(profileQuery);
  const isCreator = !!profile?.isVerifiedCreator;

  const messagesQuery = useMemoFirebase(() => {
    if (!db || !user || !chatId) return null;
    return query(collection(db, 'users', user.uid, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
  }, [db, user, chatId]);
  const { data: messages, isLoading } = useCollection(messagesQuery);

  // Track whether the user has scrolled up (don't fight their scroll position)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = distance < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading, isAiThinking]);

  // Merge AI-generated todos + register background tasks announced in messages
  useEffect(() => {
    if (!messages || !chatId || !user) return;
    if (!isAiThinking) {
      clearAiTodos(chatId);
    } else {
      const latestModelMessage = [...messages].reverse().find((msg) => msg.role === 'model');
      if (latestModelMessage) {
        // Only the active turn may update the working plan; old messages are history.
        for (const block of latestModelMessage.content.matchAll(/\[TODOS\]\s*([\s\S]*?)\[\/TODOS\]/g)) {
          try {
            const parsed = JSON.parse(block[1].trim());
            const items = Array.isArray(parsed) ? parsed : parsed?.items || parsed?.todos || [];
            mergeAiTodos(chatId, items);
          } catch {
            // tolerate partial json
          }
        }
      }
    }

    for (const msg of messages) {
      if (msg.role !== 'model') continue;
      const taskMatch = msg.content.match(/\[TASK\]\s*([\s\S]*?)\[\/TASK\]/g);
      if (taskMatch) {
        for (const raw of taskMatch) {
          try {
            const parsed = JSON.parse(raw.replace(/\[\/?TASK\]/g, '').trim());
            window.dispatchEvent(new CustomEvent('jimskay-register-bg-task', { detail: { userId: user.uid, task: parsed } }));
          } catch {
            // ignore malformed task payloads
          }
        }
      }
    }
  }, [messages, chatId, user, isAiThinking]);

  if (!chatId)
    return (
      <div ref={scrollRef} className="h-full w-full flex flex-col items-center justify-center px-8 text-center">
        <div className="relative mx-auto w-20 h-20 mb-8">
          <div className="absolute -inset-10 bg-primary/15 rounded-full blur-[48px] animate-pulse" />
          <div className="relative w-full h-full rounded-3xl bg-card border border-white/10 flex items-center justify-center shadow-2xl">
            <Zap className="w-9 h-9 text-primary" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-white/90 tracking-tight">How can I help you today?</h1>
        <p className="mt-4 text-[14px] text-white/35 font-medium max-w-md leading-relaxed">
          Ask anything — deep reasoning, research, documents, code, or persistent background tasks on your machine.
        </p>
      </div>
    );

  const msgs = messages ?? [];
  const lastMsg = msgs[msgs.length - 1];
  const hasTodos = (m: { role?: string; content?: string }) =>
    !!m?.content && m.role === 'model' && /\[TODOS\]/.test(m.content);
  const showPlanPanel = !!lastMsg && isAiThinking && hasTodos(lastMsg);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto custom-scrollbar scroll-smooth">
      <div className="w-full px-4 md:px-8 lg:px-12 pt-8 pb-6 space-y-8">
        {messages?.map((msg) => {
          const thoughtMatch = msg.content.match(/\[THOUGHTS\]([\s\S]*?)\[\/THOUGHTS\]/);
          const thoughts = thoughtMatch ? thoughtMatch[1].trim() : null;
          const mainContent = msg.content
            .replace(/\[THOUGHTS\][\s\S]*?\[\/THOUGHTS\]/, '')
            .replace(/\[\/?THOUGHTS\]/gi, '')
            .replace(/\[TODOS\][\s\S]*?\[\/TODOS\]/g, '')
            .replace(/\[TASK\][\s\S]*?\[\/TASK\]/g, '')
            .trim();
          const parsedLesson = parseVisualLessonMarker(mainContent);
          const messageText = parsedLesson.text;
          const messageLesson = (msg.visualLesson as VisualLesson | null) || parsedLesson.lesson || null;

          if (msg.role === 'user') {
            const uploadedImages: string[] = Array.isArray(msg.imageUrls) && msg.imageUrls.length
              ? msg.imageUrls
              : msg.imageUrl
                ? [msg.imageUrl]
                : [];

            return (
              <div key={msg.id} className="flex flex-col items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                {uploadedImages.length > 0 && (
                  <div className="mb-2 grid grid-cols-2 gap-2 max-w-xs w-full">
                    {uploadedImages.map((image: string, index: number) => (
                      <div key={`${image}-${index}`} className="rounded-2xl overflow-hidden border border-white/10 bg-black/20 shadow-md">
                        <img src={image} alt="Uploaded" className="object-cover w-full h-auto max-h-[260px]" />
                      </div>
                    ))}
                  </div>
                )}
                <ChatMessage
                  id={msg.id}
                  chatId={chatId || undefined}
                  type={msg.type}
                  role="user"
                  text={messageText}
                  pdfPayload={msg.pdfPayload}
                  fileAttachment={msg.fileAttachment}
                  imageUrl={uploadedImages[0] || null}
                  imageUrls={uploadedImages}
                  artifact={msg.artifact}
                  visualLesson={msg.visualLesson as VisualLesson | null}
                  videoClips={msg.videoClips}
                />
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
              {thoughts && (
                <ThinkingBlock
                  thoughts={thoughts}
                  live={!!isAiThinking && msg.id === lastMsg?.id}
                />
              )}
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="text-[14px] font-bold text-white tracking-tight">Jimskay AI</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60 border border-primary/20 bg-primary/[0.08] rounded-full px-2 py-0.5">
                      <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      Online
                    </span>
                  </div>
                  <ChatMessage
                    id={msg.id}
                    chatId={chatId || undefined}
                    type={msg.type}
                    role="model"
                    text={messageText}
                    pdfPayload={msg.pdfPayload}
                    updatedFile={msg.updatedFile}
                    imageUrl={msg.imageUrl}
                    artifact={msg.artifact}
                    visualLesson={messageLesson}
                  />
                  {msg.type === 'admin-run' && <AdminRunView steps={msg.adminSteps} />}
                  {msg.timestamp && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-[11px] text-white/25 font-medium">
                        {format(msg.timestamp.toDate(), 'HH:mm')}
                      </span>
                      {isCreator && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400/70">
                          · Sync 100%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {showPlanPanel && <ChatTodos chatId={chatId} live={!!isAiThinking} />}
        {isAiThinking && (
          <div className="flex items-center gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-[14px] font-bold text-white tracking-tight">Jimskay AI</span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90 border border-amber-300/20 bg-amber-300/[0.08] rounded-full px-2 py-0.5">
                  <span className="w-1 h-1 rounded-full bg-amber-300 animate-pulse" />
                  Working
                </span>
              </div>
              <p className="text-[13px] leading-relaxed">
                <span className="thinking-shimmer font-semibold">
                  Jimskay is working through this — deep reasoning, live planning, and executing steps
                </span>
                <span className="thinking-dots ml-2 align-middle">
                  <span className="bg-amber-300" />
                  <span className="bg-amber-300" />
                  <span className="bg-amber-300" />
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="h-10" />
    </div>
  );
}