"use client"

import { useState } from 'react';
import { expandIdeaPrompt } from '@/ai/flows/expand-idea-prompt-flow';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, Copy, Check, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export function AiExpanderDialog({ onUseResult }: { onUseResult: (result: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const handleExpand = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const response = await expandIdeaPrompt({ ideaPrompt: prompt });
      setResult(response.expandedIdea);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Expansion failed',
        description: 'Could not connect to the jimskay expander. Please try again later.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToVault = async () => {
    if (!user || !db || !result) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'ideas'), {
        title: prompt.substring(0, 40) + (prompt.length > 40 ? '...' : ''),
        content: result,
        createdAt: serverTimestamp(),
        tags: ['brainstorm', 'expanded']
      });
      toast({ title: "Jimskay Concept Vaulted" });
    } catch (e) {
      toast({ variant: "destructive", title: "Vaulting Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80">
          <Sparkles className="w-4 h-4" />
          Jimskay Expander
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col glass-panel border-white/5 rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl font-black text-white tracking-tighter">
            <Sparkles className="w-5 h-5 text-accent animate-pulse" />
            Jimskay Idea Expander
          </DialogTitle>
          <DialogDescription className="text-[7px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mt-1">
            Algorithmic brainstorming & concept synthesis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-auto custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Seed Concept</label>
            <Textarea
              placeholder="Enter a jimskay seed... e.g., 'A decentralized laboratory management protocol'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="rounded-xl min-h-[80px] border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px] focus-visible:ring-primary/30 resize-none"
              rows={3}
            />
          </div>

          {result && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex justify-between items-center">
                <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Expanded Synthesis</label>
                <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8 text-white/40 hover:text-accent">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <Card className="bg-white/[0.02] border-white/5 border-dashed">
                <CardContent className="p-4 text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap font-medium">
                  {result}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {result && (
            <Button 
              variant="outline" 
              onClick={handleSaveToVault} 
              disabled={isSaving}
              className="mr-auto rounded-xl h-10 border-white/5 bg-white/5 text-accent text-[9px] font-black uppercase tracking-widest"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Database className="w-3.5 h-3.5 mr-1" />}
              Vault Concept
            </Button>
          )}
          <Button 
            onClick={handleExpand} 
            disabled={loading || !prompt.trim()}
            className="rounded-xl h-10 bg-primary text-white font-black shadow-xl glow-primary text-[9px] uppercase tracking-widest px-6"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {result ? 'Refine' : 'Expand Idea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
