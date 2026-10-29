"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Zap,
  Sparkles,
  Send,
  Camera,
  X,
  Mic,
  MicOff,
  Volume2,
  Pause,
  Waves,
  Brain,
  FileCode,
  Code2,
  Play,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, collection, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { studioArchitect } from '@/ai/flows/jimskay-studio-flow';
import { synthesizeSpeech } from '@/ai/flows/text-to-speech-flow';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

export default function JimskayArchitectPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [chatInput, setChatInput] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (!isUserLoading && !user) router.push('/auth');

    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.onstart = () => setIsListening(true);
        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setChatInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        };
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.onerror = () => setIsListening(false);
      }
    }

    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [user, isUserLoading, router]);

  const projectDocQuery = useMemoFirebase(() => {
    if (!db || !user || !projectId) return null;
    return doc(db, 'users', user.uid, 'projects', projectId);
  }, [db, user?.uid, projectId]);

  const { data: project, isLoading: isProjectLoading } = useDoc(projectDocQuery);

  const messagesQuery = useMemoFirebase(() => {
    if (!db || !user || !projectId) return null;
    return query(
      collection(db, 'users', user.uid, 'projects', projectId, 'studio_messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );
  }, [db, user?.uid, projectId]);

  const { data: messages } = useCollection<any>(messagesQuery);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSynthesizing]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'Image too large', description: 'Maximum size is 4MB.' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        toast({ title: 'Image attached' });
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        toast({ variant: 'destructive', title: 'Voice not supported', description: 'This browser does not support speech recognition.' });
        return;
      }
      recognitionRef.current.start();
      toast({ title: 'Listening...', description: 'Speak your command.' });
    }
  };

  const playVocalSynthesis = async (text: string, id: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      setIsSpeaking(false);
      return;
    }
    try {
      setIsSpeaking(true);
      const { audioUrl } = await synthesizeSpeech(text);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingId(id);
      audio.onended = () => {
        setPlayingId(null);
        setIsSpeaking(false);
      };
      await audio.play();
    } catch {
      toast({ variant: 'destructive', title: 'Speech failed', description: 'Could not synthesize voice.' });
      setIsSpeaking(false);
    }
  };

  const handleSynthesize = async () => {
    if (!user || !project || (!chatInput.trim() && !selectedImage) || isSynthesizing) return;

    setIsSynthesizing(true);
    const command = chatInput.trim() || 'Analyze the attached image and improve the project.';
    const imageToForge = selectedImage;

    setChatInput('');
    setSelectedImage(null);

    const messagesRef = collection(db!, 'users', user.uid, 'projects', projectId, 'studio_messages');

    try {
      await addDoc(messagesRef, {
        role: 'user',
        content: command,
        imageUrl: imageToForge,
        timestamp: serverTimestamp(),
      });

      const response = await studioArchitect({
        files: project.files,
        activeFileName: project.files[0]?.name || 'index.html',
        command,
        imageUrl: imageToForge || undefined,
        isCreator: true,
      });

      if (response && response.modifiedFiles) {
        const projectRef = doc(db!, 'users', user.uid, 'projects', projectId);
        const updatedFiles = [...project.files];
        response.modifiedFiles.forEach((modFile) => {
          const index = updatedFiles.findIndex((f: any) => f.name === modFile.name);
          if (index !== -1) {
            updatedFiles[index] = modFile;
          } else {
            updatedFiles.push(modFile);
          }
        });

        await updateDoc(projectRef, {
          files: updatedFiles,
          updatedAt: serverTimestamp(),
        });

        const modelMsgRef = await addDoc(messagesRef, {
          role: 'model',
          content: response.explanation,
          thoughts: response.thoughts,
          isUpdate: true,
          timestamp: serverTimestamp(),
          modifiedFiles: response.modifiedFiles.map((f) => f.name),
        });

        toast({ title: 'Changes applied to project' });
        playVocalSynthesis(response.explanation, modelMsgRef.id);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Request failed', description: 'Could not reach the AI Architect. Try again.' });
    } finally {
      setIsSynthesizing(false);
    }
  };

  if (!isMounted || isUserLoading || (isProjectLoading && !project)) {
    return (
      <div className="h-screen w-screen app-bg flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="absolute -inset-20 bg-primary/20 rounded-full blur-[80px] animate-pulse" />
          <Loader2 className="w-16 h-16 text-primary animate-spin relative" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-primary animate-pulse">Loading Architect</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen app-bg text-white flex flex-col overflow-hidden font-sans">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-black/60 backdrop-blur-3xl shrink-0 z-[100]">
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/studio/workspace/${projectId}`)} className="rounded-xl h-9 w-9 bg-white/5 text-primary hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white shadow-2xl glow-primary shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-sm md:text-lg font-black tracking-tighter uppercase italic leading-none shimmer-text truncate max-w-[140px] md:max-w-none">
                AI Architect
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[7px] font-black uppercase tracking-[0.4em] text-primary/60 mt-0.5 hidden md:block">{project.name}</p>
                {isSpeaking && <Waves className="w-3 h-3 text-green-500 animate-pulse" />}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 md:gap-3 shrink-0">
          <Button
            onClick={() => router.push(`/studio/workspace/${projectId}`)}
            className="h-10 rounded-xl bg-white/5 hover:bg-white/10 text-primary border border-primary/20 px-4 md:px-5 text-[10px] font-black uppercase tracking-widest gap-2"
          >
            <Code2 className="w-4 h-4" />
            <span className="hidden md:inline">Editor</span>
          </Button>
          <Button
            onClick={() => router.push(`/studio/view/${projectId}`)}
            className="h-10 rounded-xl bg-white/5 hover:bg-white/10 text-accent border border-accent/20 px-4 md:px-5 text-[10px] font-black uppercase tracking-widest gap-2"
          >
            <Play className="w-4 h-4" />
            <span className="hidden md:inline">Preview</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center overflow-hidden relative surface-dim">
        <div ref={scrollRef} className="w-full max-w-4xl flex-1 overflow-y-auto custom-scrollbar space-y-6 py-8 px-4 md:px-6 pb-44">
          {messages && messages.length > 0 ? (
            messages.map((msg: any) => (
              <div key={msg.id} className={`flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                {msg.isUpdate ? (
                  <div className="glass-panel border-primary/20 bg-primary/[0.02] p-6 md:p-8 w-full rounded-[1.75rem] shadow-2xl relative overflow-hidden">
                    {msg.thoughts && (
                      <div className="mb-6 bg-white/[0.02] border border-white/5 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-4 h-4 text-primary animate-pulse" />
                          <span className="text-[9px] font-black text-primary/60 uppercase tracking-[0.35em]">Planning</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground/70 leading-relaxed italic border-l-2 border-primary/20 pl-4">{msg.thoughts}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Zap className="w-4 h-4 text-primary animate-pulse" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white uppercase tracking-widest">Changes Applied</p>
                        <span className="text-[7px] font-bold text-primary/60 uppercase tracking-[0.3em]">Project updated</span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => playVocalSynthesis(msg.content, msg.id)}
                          className={`h-8 w-8 rounded-lg bg-white/5 border border-white/10 transition-all ${playingId === msg.id ? 'text-green-500' : 'text-white/40 hover:text-primary'}`}
                        >
                          {playingId === msg.id ? <Pause className="w-4 h-4 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <p className="text-[13px] text-muted-foreground leading-relaxed font-medium mb-6 italic border-l-2 border-primary/20 pl-4">{msg.content}</p>

                    {msg.modifiedFiles && (
                      <div className="space-y-2.5">
                        <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Modified Files:</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.modifiedFiles.map((f: string, i: number) => (
                            <div key={i} className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-2">
                              <FileCode className="w-3 h-3 text-primary" />
                              <span className="text-[9px] font-bold text-white/60 uppercase tracking-tight">{f}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`flex flex-col gap-2.5 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.imageUrl && (
                      <div className="relative aspect-video w-56 md:w-64 rounded-xl overflow-hidden border border-primary/20 shadow-2xl">
                        <Image src={msg.imageUrl} alt="Attached image" fill className="object-cover" />
                      </div>
                    )}
                    <div
                      className={`px-5 py-3.5 rounded-2xl text-[14px] font-medium leading-relaxed shadow-lg ${
                        msg.role === 'user'
                          ? 'bg-primary/20 border border-primary/30 text-white'
                          : 'bg-white/[0.03] border border-white/10 text-muted-foreground'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-black border border-white/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary/50" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-black text-white uppercase italic tracking-tighter">AI Architect</h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/50 mt-2 max-w-md mx-auto leading-relaxed">
                  Ask the AI to build, modify, or improve your project. Changes are applied to your files automatically.
                </p>
              </div>
            </div>
          )}

          {isSynthesizing && (
            <div className="w-full relative px-4 md:px-5 py-8 border-y border-white/5 bg-white/[0.01] animate-in fade-in duration-500">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Architect is working...</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute -inset-2 bg-primary/20 rounded-full blur-md animate-pulse" />
                  <Brain className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] animate-pulse">Planning and synthesizing...</p>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 md:px-6">
          <div className="relative">
            {selectedImage && (
              <div className="absolute -top-28 left-0 z-50 p-2 bg-black/90 backdrop-blur-3xl border border-primary/20 rounded-xl animate-in zoom-in-95 shadow-2xl flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                  <Image src={selectedImage} alt="Selected" fill className="object-cover" />
                  <button onClick={() => setSelectedImage(null)} className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Image attached</span>
              </div>
            )}

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />

            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSynthesize())}
              placeholder={isListening ? 'Listening... speak your command.' : 'Tell the AI Architect what to build or change...'}
              className={`w-full min-h-[80px] max-h-[240px] rounded-[1.75rem] bg-black/90 backdrop-blur-3xl border text-[14px] font-bold text-primary pl-6 pr-40 py-5 resize-none focus:outline-none focus:border-primary/50 transition-all placeholder:text-primary/10 shadow-2xl ${
                isListening ? 'border-primary glow-primary' : 'border-white/10'
              }`}
            />

            <div className="absolute bottom-4 right-4 flex items-center gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMic}
                className={`h-11 w-11 rounded-xl bg-white/5 border border-white/10 transition-all ${isListening ? 'text-primary glow-primary' : 'text-muted-foreground/40 hover:text-primary'}`}
                title="Voice input"
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className={`h-11 w-11 rounded-xl bg-white/5 border border-white/10 transition-all ${selectedImage ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary'}`}
                title="Attach image"
              >
                <Camera className="w-5 h-5" />
              </Button>
              <Button
                onClick={handleSynthesize}
                disabled={isSynthesizing || (!chatInput.trim() && !selectedImage)}
                className="h-11 px-6 gradient-primary text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-xl glow-primary border-none"
              >
                {isSynthesizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-8 bg-card border-t border-white/5 flex items-center px-6 shrink-0 overflow-hidden">
        <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[8px] whitespace-nowrap">
          Jimskay Studio • AI Architect • Changes apply instantly
        </span>
      </footer>
    </div>
  );
}
