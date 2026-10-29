"use client"

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { generateMockExam, type AcademicOutput } from '@/ai/flows/academic-tutor-flow';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Loader2, Menu, RotateCcw, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function AcademicPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subject, setSubject] = useState('Mathematics');
  const [difficulty, setDifficulty] = useState<'Standard' | 'Advanced'>('Standard');
  const [exam, setExam] = useState<AcademicOutput | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isUserLoading && !user) router.push('/auth');
  }, [isUserLoading, router, user]);

  const startExam = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!subject.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      setExam(await generateMockExam({ subject: subject.trim(), difficulty }));
      setQuestionIndex(0);
      setSelected(null);
      setScore(0);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Study session failed', description: error instanceof Error ? error.message : 'Could not generate an exam.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const currentQuestion = exam?.questions[questionIndex];
  const answerQuestion = (answer: string) => {
    if (selected || !currentQuestion) return;
    setSelected(answer);
    if (answer === currentQuestion.correctAnswer) setScore((value) => value + 1);
  };

  const nextQuestion = () => {
    if (!exam || questionIndex >= exam.questions.length - 1) return;
    setQuestionIndex((value) => value + 1);
    setSelected(null);
  };

  if (!mounted || isUserLoading || !user) return <div className="fixed inset-0 app-bg flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return <div className="fixed inset-0 flex h-[100dvh] w-full overflow-hidden app-bg text-white"><div className={`fixed inset-0 z-50 bg-black/70 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`} onClick={() => setSidebarOpen(false)} /><aside className={`fixed inset-y-0 left-0 z-[60] w-64 border-r border-white/10 app-bg transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}><Sidebar currentChatId={null} onSelectChat={(id) => router.push(id ? `/chat?id=${id}` : '/chat')} onClose={() => setSidebarOpen(false)} /></aside><main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar surface-dim"><div className="mx-auto max-w-5xl p-4 md:p-8 lg:p-10 pb-20"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="md:hidden h-10 w-10 rounded-lg border border-white/10 bg-white/5"><Menu className="h-5 w-5" /></Button><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">Learn</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Study Lab</h1></div></div><span className="hidden sm:flex items-center gap-2 text-xs text-white/35"><Sparkles className="h-4 w-4 text-primary" /> Adaptive practice</span></header>{!exam && <section className="mt-12 max-w-3xl"><p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Build a focused session</p><h2 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">Practice with purpose.</h2><p className="mt-4 text-sm leading-6 text-white/50">Generate a structured mock exam for any subject, then work through it one question at a time.</p><form onSubmit={startExam} className="mt-8 glass-panel rounded-xl border-white/10 p-5 space-y-4"><div><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Subject</label><Input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 h-11 bg-white/5 border-white/10" placeholder="Mathematics, Physics, Biology..." /></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setDifficulty('Standard')} className={`rounded-lg h-9 px-4 text-xs border ${difficulty === 'Standard' ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white/50 border-white/10'}`}>Standard</Button><Button type="button" onClick={() => setDifficulty('Advanced')} className={`rounded-lg h-9 px-4 text-xs border ${difficulty === 'Advanced' ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white/50 border-white/10'}`}>Advanced</Button></div><Button type="submit" disabled={isGenerating || !subject.trim()} className="gradient-primary h-11 rounded-lg px-5 text-xs font-bold uppercase tracking-[0.16em] border-0">{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4" /> Generate session</>}</Button></form></section>}{exam && currentQuestion && <section className="mt-10 max-w-3xl"><div className="flex items-center justify-between text-xs text-white/40"><span>Question {questionIndex + 1} of {exam.questions.length}</span><span>Score {score}</span></div><div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((questionIndex + 1) / exam.questions.length) * 100}%` }} /></div><article className="glass-panel mt-8 rounded-xl border-white/10 p-6 md:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{subject} · {difficulty}</p><div className="prose prose-invert mt-5 max-w-none text-white"><ReactMarkdown>{currentQuestion.question}</ReactMarkdown></div><div className="mt-8 grid gap-3">{currentQuestion.options.map((option) => <button key={option} onClick={() => answerQuestion(option)} className={`rounded-lg border p-4 text-left text-sm transition-colors ${selected === option ? option === currentQuestion.correctAnswer ? 'border-primary bg-primary/10 text-primary' : 'border-red-400/50 bg-red-400/10 text-red-200' : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-primary/40 hover:text-white'}`}>{option}</button>)}</div>{selected && <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="h-4 w-4" /> {selected === currentQuestion.correctAnswer ? 'Correct' : `Answer: ${currentQuestion.correctAnswer}`}</div><p className="mt-3 text-sm leading-6 text-white/50">{currentQuestion.explanation}</p><div className="mt-5 flex gap-3"><Button onClick={nextQuestion} disabled={questionIndex >= exam.questions.length - 1} className="gradient-primary rounded-lg border-0 text-xs font-bold uppercase tracking-[0.14em]">Next <ArrowRight className="h-4 w-4" /></Button><Button onClick={() => setExam(null)} variant="ghost" className="rounded-lg border border-white/10 text-xs text-white/50"><RotateCcw className="h-4 w-4" /> New session</Button></div></div>}</article></section>}</div></main></div>;
}
