import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeMode } from "../../lib/theme";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  settingsOpen: boolean;
  aiOpen: boolean;
  closeToTray: boolean;
  mode: ThemeMode;
  onToggleMode: () => void;
  onToggleSettings: () => void;
  onToggleAI: () => void;
}

export function TitleBar({ settingsOpen, aiOpen, closeToTray, mode, onToggleMode, onToggleSettings, onToggleAI }: TitleBarProps) {
  const [pinned, setPinned] = useState(() => {
    const saved = localStorage.getItem("fp-pinned");
    return saved === "true";
  });

  // Sync alwaysOnTop on mount (in case HMR reset state)
  useEffect(() => {
    if (pinned) appWindow.setAlwaysOnTop(true);
  }, []);

  const handleTogglePin = async () => {
    const next = !pinned;
    await appWindow.setAlwaysOnTop(next);
    setPinned(next);
    localStorage.setItem("fp-pinned", String(next));
  };

  return (
    <div
      data-tauri-drag-region
      className="h-11 flex items-center justify-between px-4 bg-paper/55 backdrop-blur-sm border-b border-paper-deep shrink-0"
    >
      <span className="text-sm font-medium text-accent tracking-wide select-none">
        Kova
      </span>
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={onToggleMode}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors"
          title={mode === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {mode === "light" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          )}
        </button>
        {/* Pin */}
        <button
          type="button"
          onClick={handleTogglePin}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            pinned ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title={pinned ? "取消置顶" : "置顶窗口"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>
          </svg>
        </button>
        {/* AI */}
        <button
          type="button"
          onClick={onToggleAI}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            aiOpen ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title="AI 助手"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
            <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/>
            <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/>
          </svg>
        </button>
        {/* Settings */}
        <button
          type="button"
          onClick={onToggleSettings}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            settingsOpen ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title="设置"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <div className="w-px h-4 bg-paper-deep mx-0.5" />
        {/* Minimize */}
        <button type="button" onClick={() => appWindow.minimize()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        {/* Maximize */}
        <button type="button" onClick={() => appWindow.toggleMaximize()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        {/* Close */}
        <button type="button" onClick={() => closeToTray ? appWindow.hide() : appWindow.close()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-danger-bg text-ink-faint hover:text-danger transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
