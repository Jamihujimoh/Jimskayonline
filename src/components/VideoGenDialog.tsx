"use client"

import { useState } from 'react';
import { generateVideo } from '@/ai/flows/generate-video-flow';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Film, Loader2, Download, RefreshCw, Zap, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface VideoGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
}

export function VideoGenDialog({ open, onOpenChange, chatId }: VideoGenDialogProps) {
  const { user } = useUser();
  const db = useFirestore();
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [qualityProfile, setQualityProfile] = useState<'educational' | 'cinematic' | 'documentary' | 'diagrammatic'>('cinematic');
  const [cameraMotion, setCameraMotion] = useState('camera movement suited to the scene');
  const [negativePrompt, setNegativePrompt] = useState('logos, watermarks, unintelligible text');
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setVideoUrl(null);
    setProgress(10);
    
    // Simulate progress while Veo polls
    const progressInterval = setInterval(() => {
      setProgress(prev => (prev < 90 ? prev + 2 : prev));
    }, 2000);

    try {
      const response = await generateVideo({ prompt: prompt.trim(), aspectRatio: '16:9', qualityProfile, cameraMotion, negativePrompt });
      setVideoUrl(response.videoUrl);
      setProgress(100);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Jimskay Motion Synthesis Error',
        description: error.message || 'The motion protocol failed. Jimskay link timeout.',
      });
    } finally {
      setIsGenerating(false);
      clearInterval(progressInterval);
    }
  };

  const handleSaveToChat = async () => {
    if (!user || !db || !chatId || !videoUrl) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'chats', chatId, 'messages'), {
        role: 'model',
        content: `**Motion Synthesis Initialized:**\n\nPrompt: ${prompt}\n\n[Synthesized Motion Sequence Attached]`,
        imageUrl: "", // Placeholder for UI trigger if needed
        timestamp: serverTimestamp(),
      });
      // In a prototype, we notify the user.
      toast({ title: "Jimskay Asset Synced" });
      onOpenChange(false);
      setVideoUrl(null);
      setPrompt('');
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isGenerating && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[520px] rounded-[2.5rem] border-white/5 shadow-2xl p-8 glass-panel outline-none">
        <DialogHeader className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-2">
            <Film className="w-6 h-6 text-accent animate-pulse" />
          </div>
          <DialogTitle className="font-serif text-2xl font-black text-white tracking-tighter">
            Jimskay Motion Synthesis
          </DialogTitle>
          <DialogDescription className="font-black text-muted-foreground/40 leading-none text-[8px] uppercase tracking-[0.4em]">
            Veo video generation • Content-aware duration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {!videoUrl ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Video prompt</label>
                <Textarea
                  placeholder="Describe any subject, story, scene, or style you want to see..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="rounded-2xl min-h-[120px] border-white/5 bg-white/[0.03] font-bold text-white px-6 py-4 text-[12px] focus-visible:ring-accent/30 resize-none"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Quality
                    <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value as typeof qualityProfile)} className="mt-1 w-full rounded-xl border border-white/5 bg-white/[0.03] p-2 text-[11px] text-white" disabled={isGenerating}>
                      <option value="educational">Educational</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="documentary">Documentary</option>
                      <option value="diagrammatic">Diagrammatic</option>
                    </select>
                  </label>
                  <label className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 md:col-span-2">Camera direction
                    <input value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value)} className="mt-1 w-full rounded-xl border border-white/5 bg-white/[0.03] p-2 text-[11px] text-white" disabled={isGenerating} />
                  </label>
                </div>
                <label className="block text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Negative prompt
                  <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} className="mt-1 w-full rounded-xl border border-white/5 bg-white/[0.03] p-2 text-[11px] text-white" disabled={isGenerating} />
                </label>
              </div>
              
              {isGenerating && (
                <div className="space-y-3 animate-in fade-in duration-500">
                  <div className="flex justify-between items-end px-1">
                    <span className="text-[7px] font-black uppercase tracking-widest text-accent animate-pulse">Synthesizing...</span>
                    <span className="text-[7px] font-black text-muted-foreground/40">{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-1000 shadow-[0_0_10px_hsl(var(--accent))]" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in duration-700 bg-black/50">
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                loop 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <Button size="icon" variant="secondary" onClick={() => setVideoUrl(null)} className="h-8 w-8 rounded-xl bg-black/60 backdrop-blur-md border-white/10 hover:bg-black">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-3 sm:gap-3">
          {videoUrl ? (
            <Button 
              onClick={handleSaveToChat}
              disabled={!chatId}
              className="w-full rounded-2xl h-14 bg-primary text-white font-black shadow-xl glow-primary text-[10px] uppercase tracking-[0.2em] border-none"
            >
              Sync to Workspace
            </Button>
          ) : (
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || !prompt.trim()}
              className="w-full rounded-2xl h-14 gradient-accent text-white font-black shadow-xl glow-accent text-[10px] uppercase tracking-[0.2em] group border-none"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 mr-2 group-hover:scale-125 transition-transform" />}
              Begin Motion Synthesis
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
