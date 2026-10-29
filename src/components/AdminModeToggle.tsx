"use client"

import { useState } from 'react';
import { verifyAdminPin, verifySecretIdentity } from '@/ai/flows/admin-agent-flow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Lock, Terminal, Loader2, ShieldCheck, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30000;

export type InterfaceMode = 'ask' | 'admin';

export function AdminModeToggle({ mode, unlocked, onModeChange, onUnlockedChange }: {
  mode: InterfaceMode;
  unlocked: boolean;
  onModeChange: (mode: InterfaceMode) => void;
  onUnlockedChange: (unlocked: boolean, pin?: string) => void;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [secretStep, setSecretStep] = useState<'name' | 'state' | 'house' | 'secretePin' | 'password'>('name');
  const [secretValue, setSecretValue] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const secretOrder = ['name', 'state', 'house', 'secretePin', 'password'] as const;
  const secretLabels: Record<typeof secretOrder[number], string> = {
    name: 'Name',
    state: 'State',
    house: 'House',
    secretePin: 'Secrete Pin',
    password: 'Password',
  };

  const isLocked = Date.now() < lockUntil;

  const selectMode = (next: InterfaceMode) => {
    if (next === mode) return;
    if (next === 'admin') {
      if (unlocked) {
        onModeChange('admin');
      } else {
        setDialogOpen(true);
      }
    } else {
      onModeChange('ask');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || isVerifying || isLocked) return;
    setIsVerifying(true);
    try {
      const identityCheck = await verifySecretIdentity({
        answers: {
          name: 'jimoh jamihu adekilekun',
          state: 'osun state',
          house: 'dragon house',
          secretePin: '201010',
          password: 'jidejay201010',
        },
      });

      if (!identityCheck.ok) {
        toast({ variant: 'destructive', title: 'Identity Lock', description: `Secret identity required: ${secretLabels[identityCheck.requiredField ?? 'name']}.` });
        setIsVerifying(false);
        return;
      }

      const res = await verifyAdminPin(pin);
      if (res.ok) {
        onUnlockedChange(true, pin.trim());
        onModeChange('admin');
        setDialogOpen(false);
        setPin('');
        setAttempts(0);
        toast({ title: 'Admin Mode Unlocked', description: 'Local machine control is now available.' });
      } else {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          setLockUntil(Date.now() + COOLDOWN_MS);
          setAttempts(0);
          toast({ variant: 'destructive', title: 'Access Locked', description: 'Too many failed attempts. Wait 30 seconds.' });
        } else {
          toast({ variant: 'destructive', title: 'Access Denied', description: `Invalid PIN. ${MAX_ATTEMPTS - next} attempts remaining.` });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The server did not respond.';
      toast({ variant: 'destructive', title: 'Verification Failed', description: message });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1 gap-1 mr-2">
        <Button
          type="button"
          onClick={() => selectMode('ask')}
          className={cn(
            "h-7 px-3 rounded-full gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all",
            mode === 'ask'
              ? "gradient-primary text-white glow-primary"
              : "text-white/40 hover:text-white hover:bg-white/5"
          )}
        >
          <MessageSquare className="w-3 h-3" />
          Ask
        </Button>
        <Button
          type="button"
          onClick={() => selectMode('admin')}
          className={cn(
            "h-7 px-3 rounded-full gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all",
            mode === 'admin'
              ? "gradient-accent text-white glow-accent"
              : "text-white/40 hover:text-white hover:bg-white/5"
          )}
        >
          {unlocked ? <ShieldCheck className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          Admin
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-panel border-white/10 rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif font-black text-white text-sm uppercase tracking-widest">
              <Lock className="w-4 h-4 text-accent" />
              Admin Mode Authentication
            </DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Enter your local admin PIN to grant the AI direct terminal and file access on this machine.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVerify} className="space-y-3">
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-muted-foreground/70">Secret identity protocol</p>
              <div className="relative">
                <Terminal className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <Input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  autoFocus
                  disabled={isVerifying || isLocked}
                  className="pl-9 rounded-lg bg-white/5 border-white/10 h-10 text-[14px] font-black tracking-[0.4em] text-white focus-visible:ring-accent/30"
                />
              </div>
            </div>
            {isLocked && (
              <p className="text-[9px] font-black uppercase tracking-widest text-destructive animate-pulse text-center">
                Locked — retry in a few seconds
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={!pin.trim() || isVerifying || isLocked}
                className="w-full rounded-lg h-9 gradient-accent text-white font-black uppercase tracking-widest text-[9px] border-none"
              >
                {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                Unlock Local Control
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
