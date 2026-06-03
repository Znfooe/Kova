export function ColorRow({ label, value, defaultVal, onChange }: { label: string; value: string; defaultVal: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-ink-soft">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-paper-deep cursor-pointer"
          title={`选择${label}`}
        />
        {value !== defaultVal && (
          <button type="button" onClick={() => onChange(defaultVal)}
            className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
            title="恢复默认">
            重置
          </button>
        )}
      </div>
    </div>
  );
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25 cursor-pointer select-none"
      onClick={() => onChange(!checked)}>
      <span className="text-[12px] text-ink-soft">{label}</span>
      <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${checked ? "bg-accent" : "bg-paper-deep/50"}`}>
        <div className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${checked ? "translate-x-[14px]" : "translate-x-0"}`} />
      </div>
    </div>
  );
}

export function SliderRow({ label, value, min, max, step, unit, defaultVal, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; defaultVal: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-lg px-2.5 py-2 bg-paper-warm/45 border border-paper-deep/25">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-ink-soft">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-ink-soft">{value}{unit}</span>
          {value !== defaultVal && (
            <button type="button" onClick={() => onChange(defaultVal)}
              className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
              title="恢复默认">
              重置
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        title={label}
        className="w-full h-1 bg-paper-deep rounded-full appearance-none cursor-pointer accent-accent"
      />
    </div>
  );
}

export function FontRow({ label, value, presetFonts, customFonts, downloadableFonts, defaultVal, onChange, onImport, onDownload }: {
  label: string; value: string; presetFonts: { name: string; value: string }[]; customFonts: string[];
  downloadableFonts: { name: string; file: string; url: string }[];
  defaultVal: string; onChange: (v: string) => void; onImport: () => void; onDownload: (font: { name: string; file: string; url: string }) => void;
}) {
  const allFonts = [...presetFonts, ...customFonts.map(f => ({ name: f, value: f }))];
  const displayName = allFonts.find(f => f.value === value)?.name || (value || "系统默认");
  const downloadedNames = customFonts.map(f => f.toLowerCase());
  return (
    <div className="rounded-lg px-2.5 py-2 bg-paper-warm/45 border border-paper-deep/25">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-ink-soft">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-soft">{displayName}</span>
          {value !== defaultVal && (
            <button type="button" onClick={() => onChange(defaultVal)}
              className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
              title="恢复默认">
              重置
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presetFonts.map(f => (
          <button key={f.value} type="button" onClick={() => onChange(f.value)}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${value === f.value ? "bg-accent-mist text-accent" : "bg-paper-deep/30 text-ink-faint hover:text-ink-soft"}`}>
            {f.name}
          </button>
        ))}
        {customFonts.map(f => (
          <button key={f} type="button" onClick={() => onChange(f)}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${value === f ? "bg-accent-mist text-accent" : "bg-paper-deep/30 text-ink-faint hover:text-ink-soft"}`}>
            {f}
          </button>
        ))}
        {downloadableFonts.filter(f => !downloadedNames.includes(f.name.replace(/\s+/g, "-").toLowerCase())).map(f => (
          <button key={f.file} type="button" onClick={() => onDownload(f)}
            className="px-2 py-1 rounded text-[10px] bg-paper-deep/30 text-ink-faint hover:text-accent transition-colors">
            ↓ {f.name}
          </button>
        ))}
        <button type="button" onClick={onImport}
          className="px-2 py-1 rounded text-[10px] bg-paper-deep/30 text-ink-faint hover:text-accent transition-colors">
          + 导入
        </button>
      </div>
    </div>
  );
}

export function TabSizeRow({ label, value, defaultVal, onChange }: { label: string; value: number; defaultVal: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          {[2, 4].map(size => (
            <button key={size} type="button" onClick={() => onChange(size)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${value === size ? "bg-accent-mist text-accent" : "bg-paper-deep/30 text-ink-faint hover:text-ink-soft"}`}>
              {size}
            </button>
          ))}
        </div>
        {value !== defaultVal && (
          <button type="button" onClick={() => onChange(defaultVal)}
            className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
            title="恢复默认">
            重置
          </button>
        )}
      </div>
    </div>
  );
}

export function ViewModeRow({ label, value, defaultVal, onChange }: { label: string; value: string; defaultVal: string; onChange: (v: string) => void }) {
  const modes = [
    { value: "edit", name: "编辑" },
    { value: "split", name: "分栏" },
    { value: "preview", name: "预览" },
  ];
  return (
    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          {modes.map(m => (
            <button key={m.value} type="button" onClick={() => onChange(m.value)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${value === m.value ? "bg-accent-mist text-accent" : "bg-paper-deep/30 text-ink-faint hover:text-ink-soft"}`}>
              {m.name}
            </button>
          ))}
        </div>
        {value !== defaultVal && (
          <button type="button" onClick={() => onChange(defaultVal)}
            className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
            title="恢复默认">
            重置
          </button>
        )}
      </div>
    </div>
  );
}
