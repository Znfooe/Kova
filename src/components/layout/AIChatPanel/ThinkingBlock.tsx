import { useState } from "react";

export function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-1.5 bg-transparent">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center text-[11px] text-ink-ghost hover:text-ink-faint transition-colors bg-transparent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-1.5 transition-transform ${expanded ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6"/></svg>
        <span>深度思考</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-4 p-2.5 bg-paper-warm/60 border-l-2 border-accent/40 rounded-r-lg text-[11px] text-ink-faint leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}
