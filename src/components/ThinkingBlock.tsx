"use client"

import { useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP_REVEAL_MS = 950;
const COLLAPSE_DELAY_MS = 1400;

/**
 * Step-by-step deep reasoning display.
 * - While the model is working (`live`) the block is expanded and steps appear
 *   one by one (progressive reveal), with the latest step marked active and
 *   earlier ones marked done.
 * - When the work finishes (`live` flips false) the block keeps showing the
 *   full reasoning for a short beat, then automatically collapses back to the
 *   compact "Reasoning · N steps" row — matching the collapse-on-complete
 *   behavior of HackerAI.
 * - A completed block that mounts directly (e.g. a historical message) starts
 *   collapsed and can be expanded to review the intermediate working states.
 */
export function ThinkingBlock({ thoughts, live = false }: { thoughts: string; live?: boolean }) {
  const [open, setOpen] = useState(live);
  const [revealCount, setRevealCount] = useState(0);
  const prevLiveRef = useRef(live);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lines = thoughts.split('\n').filter((l) => l.trim().length > 0);
  const steps = lines.map((line) => {
    // Strip "1.", "1)", "Step 1:" style prefixes — the dot marker renders the step index
    const cleaned = line.replace(/^\s*(?:step\s*)?\d+[.):\-–]\s*/i, '').trim();
    return cleaned || line.trim();
  });
  const stepCount = steps.length;

  // Progressive reveal: surface one new step at a time while live.
  useEffect(() => {
    if (!live) return;
    setRevealCount(0);
    revealTimerRef.current = setInterval(() => {
      setRevealCount((c) => {
        const next = c + 1;
        if (next >= stepCount && revealTimerRef.current) {
          window.clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
        }
        return Math.min(next, stepCount);
      });
    }, STEP_REVEAL_MS);
    return () => {
      if (revealTimerRef.current) {
        window.clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [live, stepCount]);

  // Auto-collapse when a live block transitions to completed.
  useEffect(() => {
    const wasLive = prevLiveRef.current;
    prevLiveRef.current = live;
    if (wasLive && !live && open) {
      // Work finished while this block was expanded — collapse it shortly after.
      collapseTimerRef.current = setTimeout(() => {
        collapseTimerRef.current = null;
        setOpen(false);
      }, COLLAPSE_DELAY_MS);
    }
    return () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, [live, open]);

  // While live-streaming keep pinned to the bottom of the reasoning text
  useEffect(() => {
    if (live && open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [thoughts, live, open, revealCount]);

  const revealed = live ? Math.max(1, revealCount) : stepCount;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 select-none rounded-lg px-2 py-1.5 -ml-2 transition-colors hover:bg-white/[0.04]',
          'text-left w-full'
        )}
      >
        <Brain className={cn('w-3.5 h-3.5 shrink-0', live ? 'text-primary animate-pulse' : 'text-white/30')} />
        {open ? (
          <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
        )}
        {live ? (
          <span className="thinking-shimmer text-[13px] font-semibold">Reasoning step-by-step</span>
        ) : (
          <span className="text-[13px] font-medium text-white/45">
            Reasoning
            <span className="text-white/25"> · {stepCount} step{stepCount === 1 ? '' : 's'}</span>
          </span>
        )}
        {live && (
          <span className="thinking-dots ml-auto shrink-0">
            <span className="bg-primary" />
            <span className="bg-primary" />
            <span className="bg-primary" />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={bodyRef}
          className={cn(
            'mt-2 ml-[22px] overflow-y-auto custom-scrollbar',
            live ? 'max-h-64' : 'max-h-[420px]'
          )}
        >
          <div className="reasoning-block">
            {/* Live progress shimmer line */}
            {live && (
              <div className="h-[2px] w-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[thinking-shimmer_1.6s_linear_infinite]"
                  style={{ backgroundSize: '200% auto' }}
                />
              </div>
            )}
            {steps.slice(0, revealed).map((step, i) => {
              const isLatest = live && i === revealed - 1;
              return (
                <div
                  key={i}
                  className={cn(
                    'reasoning-step reasoning-in',
                    live ? (isLatest ? 'is-active' : 'is-done') : 'is-done'
                  )}
                  style={{ animationDelay: `${Math.min(i * 90, 900)}ms` }}
                >
                  <span>{step}</span>
                </div>
              );
            })}
            {live && revealed >= stepCount && (
              <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-t border-white/[0.04]">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-bounce [animation-delay:300ms]" />
                <span className="text-[11px] text-primary/60 font-medium ml-1 animate-pulse">
                  Working through the problem...
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
