"use client"

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Scan, 
  Upload, 
  Download, 
  RefreshCw, 
  Type, 
  ArrowLeft, 
  Loader2, 
  Zap, 
  ShieldCheck,
  MousePointer2,
  Save,
  Image as ImageIcon,
  Cpu,
  Sparkles
} from 'lucide-react';
import { performSpatialOcr, type OcrNode } from '@/ai/flows/ocr-forge-flow';
import { useToast } from '@/hooks/use-toast';

export default function OpticalForgePage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [image, setImage] = useState<string | null>(null);
  const [nodes, setNodes] = useState<OcrNode[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isForging, setIsForging] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setNodes([]);
        setSelectedNodeId(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startOcr = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    try {
      const result = await performSpatialOcr({ imageDataUri: image });
      if (result && result.nodes) {
        setNodes(result.nodes);
        toast({ title: "Neural Grid Synced", description: `${result.nodes.length} nodes detected.` });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Synthesis Link Error", description: e.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateNodeText = (id: string, newText: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, text: newText } : n));
  };

  const forgeNewImage = () => {
    if (!image || !canvasRef.current) return;
    setIsForging(true);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Synthesis: Overwrite nodes with updated text
      nodes.forEach(node => {
        const x = (node.x / 1000) * img.width;
        const y = (node.y / 1000) * img.height;
        const w = (node.width / 1000) * img.width;
        const h = (node.height / 1000) * img.height;

        // Erase old text by drawing background color patch
        ctx.fillStyle = node.bgColor || '#ffffff';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

        // Render new text
        const fontSize = h * 0.8;
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = node.color || '#000000';
        ctx.textBaseline = 'top';
        ctx.fillText(node.text, x, y);
      });

      setIsForging(false);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `jimskay-forge-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Synthesis Exported" });
    };
    img.src = image;
  };

  if (isUserLoading || !user) return null;

  return (
    <div className="flex h-[100dvh] w-full app-bg overflow-hidden fixed inset-0 scanline-effect perspective-matrix">
      <div 
        className={`fixed inset-0 z-[60] bg-black/90 transition-opacity duration-1000 md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      
      <div className={`fixed top-0 left-0 z-[70] h-full w-64 app-bg border-r border-white/5 transition-all duration-700 transform md:relative md:translate-x-0 shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          currentChatId={null} 
          onSelectChat={(id) => router.push(id ? `/chat?id=${id}` : '/chat')} 
          onClose={() => setIsSidebarOpen(false)} 
        />
      </div>

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col gap-6 pb-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in slide-in-from-top-8 duration-1000">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl gradient-accent flex items-center justify-center text-white glow-accent shadow-2xl animate-float">
                <Scan className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none shimmer-text">
                  Optical<span className="text-accent">Forge</span>
                </h1>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">Gemini 1.5 Flash • Neural Spatial OCR</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl h-10 bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest px-6 hover:bg-white/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Source
            </Button>
            {image && nodes.length === 0 && (
              <Button 
                onClick={startOcr}
                disabled={isAnalyzing}
                className="cyber-button rounded-xl h-10 gradient-accent text-white font-black text-[10px] uppercase tracking-widest px-8 border-none glow-accent shadow-xl"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                Analyze Grid
              </Button>
            )}
            {nodes.length > 0 && (
              <Button 
                onClick={forgeNewImage}
                disabled={isForging}
                className="cyber-button rounded-xl h-10 bg-primary text-white font-black text-[10px] uppercase tracking-widest px-8 border-none glow-primary shadow-xl"
              >
                {isForging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Forge Synthesis
              </Button>
            )}
          </div>
        </div>

        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

        <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
          {/* Main Display Area */}
          <div className="flex-1 flex flex-col gap-4">
            <Card className="glass-panel border-white/5 rounded-[2.5rem] flex-1 relative overflow-hidden bg-black/40 shadow-2xl flex items-center justify-center p-4 group">
              <div className="absolute inset-0 bg-accent/5 animate-pulse-dragon opacity-20 pointer-events-none" />
              {!image ? (
                <div className="text-center space-y-4 opacity-20">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-[0.5em]">No Source Data Injected</p>
                </div>
              ) : (
                <div ref={containerRef} className="relative max-w-full max-h-full shadow-2xl border-4 border-white/5 rounded-xl overflow-hidden group">
                  <img src={image} alt="Source" className="max-w-full max-h-[70vh] block" />
                  
                  {nodes.map(node => (
                    <div 
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`absolute border transition-all cursor-pointer group/node ${
                        selectedNodeId === node.id 
                          ? 'border-accent bg-accent/10 z-20 shadow-[0_0_20px_rgba(0,255,255,0.4)]' 
                          : 'border-white/20 bg-white/5 hover:border-accent/50'
                      }`}
                      style={{
                        left: `${node.x / 10}%`,
                        top: `${node.y / 10}%`,
                        width: `${node.width / 10}%`,
                        height: `${node.height / 10}%`,
                      }}
                    >
                      <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-black/80 text-[8px] font-black text-white rounded border border-white/10 opacity-0 group-hover/node:opacity-100 transition-opacity">
                        NODE_{node.id.substring(node.id.length - 4)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Synthesis Sidebar */}
          <div className="w-full lg:w-96 flex flex-col gap-6 shrink-0">
            <Card className="glass-panel border-white/5 rounded-[2.5rem] p-6 shadow-2xl surface-dim/80 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-accent" />
                  <h2 className="font-serif text-lg font-black text-white tracking-tighter uppercase italic">Synthesis Editor</h2>
                </div>
                <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">{nodes.length} Nodes</span>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                {nodes.length > 0 ? (
                  nodes.map((node) => (
                    <div 
                      key={node.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        selectedNodeId === node.id ? 'bg-accent/5 border-accent/30' : 'bg-white/[0.02] border-white/5'
                      }`}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40 block mb-2">Fragment Protocol</label>
                      <Input 
                        value={node.text}
                        onChange={(e) => updateNodeText(node.id, e.target.value)}
                        className="bg-transparent border-none text-[12px] font-bold text-white p-0 h-auto focus-visible:ring-0"
                      />
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                    <MousePointer2 className="w-10 h-10 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[180px] leading-relaxed">
                      Initialize neural analysis to unlock spatial editing nodes.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-8 flex items-center overflow-hidden border-t border-white/5 z-[100]">
          <div className="animate-marquee inline-block whitespace-nowrap">
            <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[8px] mx-8">
              &bull; OPTICAL FORGE ACTIVE &bull; NEURAL SPATIAL SYNTHESIS &bull; GEMINI 1.5 FLASH ENGINE &bull; 100% LAYOUT PRESERVATION &bull; IMAGE FORGING READY &bull;
            </span>
            <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[8px] mx-8">
              &bull; OPTICAL FORGE ACTIVE &bull; NEURAL SPATIAL SYNTHESIS &bull; GEMINI 1.5 FLASH ENGINE &bull; 100% LAYOUT PRESERVATION &bull; IMAGE FORGING READY &bull;
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
