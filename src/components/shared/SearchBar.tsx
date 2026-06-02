interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="px-3 pt-3 pb-2 shrink-0">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-ghost" width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索笔记..."
          className="w-full h-8 pl-8 pr-3 text-xs bg-paper-warm/45 rounded-lg border border-paper-deep/25 focus-within:border-accent/30 focus:outline-none text-ink-soft placeholder:text-ink-ghost transition-colors"
        />
      </div>
    </div>
  );
}
