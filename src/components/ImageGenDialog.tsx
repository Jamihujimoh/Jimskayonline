"use client"

import { useState } from 'react';
import { generateImage } from '@/ai/flows/generate-image-flow';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, Download, RefreshCw, X } from 'lucide-react';
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
import Image from 'next/image';

interface ImageGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
}

export function ImageGenDialog({ open, onOpenChange, chatId }: ImageGenDialogProps) {
  const { user } = useUser();
  const db = useFirestore();
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const response = await generateImage({ prompt: prompt.trim() });
      setImageUrl(response.imageUrl);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Jimskay Imaging Synthesis Error',
        description: error.message || 'The imaging protocol failed. Verify your conceptual parameters.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToChat = async () => {
    if (!user || !db || !chatId || !imageUrl) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'chats', chatId, 'messages'), {
        role: 'model',
        content: `![Generated Image](${imageUrl})\n\n**Prompt:** ${prompt}`,
        timestamp: serverTimestamp(),
      });
      toast({ title: "Jimskay Asset Synced" });
      onOpenChange(false);
      setImageUrl(null);
      setPrompt('');
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed" });
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `jimskay-visual-${Date.now()}.png`;
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isGenerating && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[480px] rounded-[2rem] border-white/5 shadow-2xl p-6 glass-panel outline-none">
        <DialogHeader className="space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center mb-1">
            <Sparkles className="w-5 h-5 text-accent animate-pulse" />
          </div>
          <DialogTitle className="font-serif text-lg font-black text-white tracking-tighter">
            Jimskay Visualization
          </DialogTitle>
          <DialogDescription className="font-black text-muted-foreground/40 leading-none text-[8px] uppercase tracking-[0.3em]">
            Synthesize visuals from pure conceptual data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!imageUrl ? (
            <div className="space-y-3">
              <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Visual Concept</label>
              <Textarea
                placeholder="Describe the jimskay image... e.g., 'A futuristic laboratory prefect workstation in space'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="rounded-xl min-h-[100px] border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px] focus-visible:ring-primary/30 resize-none"
              />
            </div>
          ) : (
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in duration-500 bg-black/50">
              <Image 
                src={imageUrl} 
                alt="Generated Visual" 
                fill 
                className="object-cover"
                unoptimized
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button size="icon" variant="secondary" onClick={() => setImageUrl(null)} className="h-7 w-7 rounded-lg bg-black/60 backdrop-blur-md border-white/10">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="secondary" onClick={handleDownload} className="h-7 w-7 rounded-lg bg-black/60 backdrop-blur-md border-white/10">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          {imageUrl ? (
            <Button 
              onClick={handleSaveToChat}
              disabled={!chatId}
              className="w-full rounded-xl h-11 bg-primary text-white font-black shadow-xl glow-primary text-[10px] uppercase tracking-[0.2em] group border-none"
            >
              Sync to Workspace
            </Button>
          ) : (
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || !prompt.trim()}
              className="w-full rounded-xl h-11 bg-primary text-white font-black shadow-xl glow-primary text-[10px] uppercase tracking-[0.2em] group border-none"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Begin Synthesis
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
