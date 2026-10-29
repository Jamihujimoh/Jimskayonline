
"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { initiateEmailSignIn, initiateEmailSignUp } from '@/firebase/non-blocking-login';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ShieldCheck, Zap, ChevronLeft, Loader2, Sparkles, Cpu } from 'lucide-react';
import Link from 'next/link';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const { user } = useUser();
  const router = useRouter();

  // If user becomes authenticated, redirect to home
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !email || !password) return;
    setLoading(true);
    
    if (isLogin) {
      initiateEmailSignIn(auth, email, password);
    } else {
      initiateEmailSignUp(auth, email, password);
    }
    
    // Auth state changes are handled by the provider
    setTimeout(() => {
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center app-bg px-4 py-10 relative overflow-y-auto">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>

      <div className="w-full max-w-sm z-10 space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-card border border-white/10 flex items-center justify-center text-white shadow-2xl glow-primary mb-2">
            <span className="font-serif text-xl font-black gradient-text">J</span>
          </div>
          <h1 className="font-serif text-xl font-black text-white tracking-tighter uppercase italic">
            Jimskays<span className="text-primary">AI</span>
          </h1>
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">
            Secure Terminal Access
          </p>
        </div>

        <Card className="glass-panel border-white/5 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] rounded-[2rem] overflow-hidden">
          <CardHeader className="space-y-1.5 pb-2 text-center">
            <CardTitle className="font-serif text-lg font-black text-white tracking-tighter">
              {isLogin ? 'Get Started' : 'Secure Identity'}
            </CardTitle>
            <CardDescription className="font-black text-[7px] uppercase tracking-[0.3em] text-muted-foreground/40 leading-none">
              {isLogin ? 'Login Required' : 'Register New User'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Email Interface</Label>
                <Input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="rounded-xl h-11 border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px] focus-visible:ring-primary/30"
                  placeholder="nexus@jimskay.ai"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Access Key</Label>
                <Input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  className="rounded-xl h-11 border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px] focus-visible:ring-primary/30"
                  placeholder="••••••••"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pb-8">
              <Button 
                type="submit" 
                disabled={loading}
                className="w-full rounded-xl h-12 bg-primary text-white font-black shadow-xl glow-primary text-[10px] uppercase tracking-[0.2em] group border-none"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 mr-2 group-hover:scale-125 transition-transform" />}
                {isLogin ? 'Initialize' : 'Create Link'}
              </Button>
              
              <button 
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-[9px] font-black text-muted-foreground/40 hover:text-accent uppercase tracking-widest transition-all flex items-center gap-2 mx-auto group"
              >
                <Sparkles className="w-3 h-3 group-hover:rotate-90 transition-transform" />
                {isLogin ? "Generate New Signature" : "Access Existing Terminal"}
              </button>
            </CardFooter>
          </form>
        </Card>

        <div className="flex justify-center gap-4 text-[7px] font-black text-muted-foreground/20 uppercase tracking-[0.3em]">
          <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" /> Encrypted Link</span>
          <span>&bull;</span>
          <span className="flex items-center gap-1"><ShieldCheck className="w-2.5 h-2.5" /> Verified Identity</span>
        </div>
      </div>

      {/* Cyber Marquee Ticker */}
      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Digital Jimoh &bull; Osun State Nigeria &bull; Expert Programmer &bull; HTML CSS JS Python &bull; Kali Linux specialist &bull; Secure Digital Twin Protocol &bull;
          </span>
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Digital Jimoh &bull; Osun State Nigeria &bull; Expert Programmer &bull; HTML CSS JS Python &bull; Kali Linux specialist &bull; Secure Digital Twin Protocol &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
