"use client"

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Sparkles, Brain, Loader2, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiSettingsDialog({ open, onOpenChange }: AiSettingsDialogProps) {
  const { user } = useUser();
  const db = useFirestore();
  const [temperature, setTemperature] = useState([0.7]);
  const [webSearch, setWebSearch] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function loadSettings() {
      if (!user || !db || !open) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.aiTemperature !== undefined) setTemperature([data.aiTemperature]);
          if (data.webSearchEnabled !== undefined) setWebSearch(data.webSearchEnabled);
        }
      } catch (e) {
        console.error("Calibration load failure:", e);
      }
    }
    loadSettings();
  }, [open, user, db]);

  const handleSave = async () => {
    if (!user || !db) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        aiTemperature: temperature[0],
        webSearchEnabled: webSearch,
      }, { merge: true });

      toast({
        title: "Calibration Synced",
        description: "Jimskay parameters optimized.",
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Calibration Failed",
        description: "Jimskay link timeout.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px] rounded-2xl border-white/5 shadow-2xl p-5 glass-panel outline-none">
        <DialogHeader className="space-y-1">
          <div className="w-8 h-8 rounded-lg bg-accent/5 flex items-center justify-center mb-1">
            <Settings className="w-4 h-4 text-accent animate-spin-slow" />
          </div>
          <DialogTitle className="font-serif text-lg font-black text-white tracking-tighter">
            Jimskay Calibration
          </DialogTitle>
          <DialogDescription className="font-black text-muted-foreground/40 leading-none text-[7px] uppercase tracking-[0.3em]">
            Optimization Protocols
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="flex items-center gap-2 font-black text-[7px] uppercase tracking-[0.3em] text-muted-foreground/60">
                <Brain className="w-3 h-3 text-primary" />
                Creativity Quotient
              </Label>
              <span className="text-[9px] font-black text-primary">
                {(temperature[0] * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={temperature}
              onValueChange={setTemperature}
              max={1}
              step={0.1}
              disabled={isSaving}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5">
            <div className="space-y-0.5">
              <Label className="font-bold text-[10px] flex items-center gap-2 text-white">
                <Sparkles className="w-3 h-3 text-accent" />
                Live Network
              </Label>
              <p className="text-[6px] text-muted-foreground/30 font-black uppercase tracking-widest">
                External Knowledge Link
              </p>
            </div>
            <Switch 
              checked={webSearch} 
              onCheckedChange={setWebSearch} 
              disabled={isSaving}
              className="scale-75 data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)} 
            disabled={isSaving}
            className="rounded-lg h-9 font-bold flex-1 text-[9px] uppercase tracking-widest"
          >
            Abort
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="rounded-lg h-9 bg-primary px-4 font-black shadow-xl flex-[1.5] text-[9px] uppercase tracking-widest border-none"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
            Sync Protocol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
