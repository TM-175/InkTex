import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Terminal, Trash2 } from 'lucide-react';
import { useCompileStore } from '@/store/compileStore';
import { IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';

/** Highlight the lines a reader scans for in a wall of TeX output. */
function lineClass(line: string): string {
  if (/^!|^\s*!\s|Fatal error|Emergency stop/.test(line)) return 'text-rose-400';
  if (/Warning|Overfull|Underfull/i.test(line)) return 'text-amber-400/90';
  if (/^Latexmk|^InkTex/.test(line)) return 'text-sky-400';
  if (/Output written on/.test(line)) return 'text-emerald-400';
  return 'text-content-secondary';
}

export function OutputPanel() {
  const outputLines = useCompileStore((state) => state.outputLines);
  const clearOutput = useCompileStore((state) => state.clearOutput);
  const phase = useCompileStore((state) => state.phase);
  const command = useCompileStore((state) => state.result?.command ?? null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Follow the tail while a build streams, unless the user has scrolled up.
  useEffect(() => {
    if (!autoScroll) return;
    const container = scrollRef.current;
    if (container !== null) container.scrollTop = container.scrollHeight;
  }, [outputLines, autoScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
        <span className="truncate font-mono text-[0.6875rem] text-content-muted">
          {command ?? (phase === 'running' ? 'Starting compiler…' : 'No build has run yet')}
        </span>
        <div className="ml-auto flex items-center">
          <IconButton
            label={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            active={autoScroll}
            onClick={() => setAutoScroll((value) => !value)}
          >
            <ArrowDownToLine className="size-3.5" />
          </IconButton>
          <IconButton label="Clear output" onClick={clearOutput}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          // Re-engage auto-scroll only when the user returns to the bottom.
          const atBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          setAutoScroll(atBottom);
        }}
        className="min-h-0 flex-1 overflow-auto bg-surface-sunken px-3 py-2"
      >
        {outputLines.length === 0 ? (
          <EmptyState
            icon={<Terminal className="size-8" />}
            title="No compiler output"
            description="Output from latexmk and the TeX engine streams here while a build runs."
          />
        ) : (
          <pre className="selectable font-mono text-[0.6875rem] leading-[1.55] whitespace-pre-wrap">
            {outputLines.map((line, index) => (
              <div key={index} className={cn('break-words', lineClass(line))}>
                {line === '' ? ' ' : line}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
