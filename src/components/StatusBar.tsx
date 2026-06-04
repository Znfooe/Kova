import { useState, useEffect } from "react";
import type { Note } from "../lib/db";
import { loadFontSize, loadFontWeight, loadTabSize } from "../lib/theme";
import { loadZoom } from "../lib/zoom";

interface StatusBarProps {
  selectedNote: Note | null;
  noteCount: number;
}

export function StatusBar({ selectedNote, noteCount }: StatusBarProps) {
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [fontWeight, setFontWeight] = useState(loadFontWeight);
  const [tabSize, setTabSize] = useState(loadTabSize);
  const [zoom, setZoom] = useState(() => Math.round(loadZoom() * 100));

  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      if (key === "font-size") setFontSize(value);
      if (key === "font-weight") setFontWeight(value);
      if (key === "tab-size") setTabSize(value);
      if (key === "zoom") setZoom(Math.round(value * 100));
    };
    window.addEventListener("fp-settings-changed", handler);
    return () => window.removeEventListener("fp-settings-changed", handler);
  }, []);

  return (
    <div className="h-7 px-4 flex items-center justify-between text-[11px] text-ink-ghost border-t border-paper-deep/20 bg-paper/30 shrink-0">
      {selectedNote ? (
        <>
          <span>{(selectedNote.title + selectedNote.content).length} 字 · {fontSize}px · 粗细 {fontWeight} · Tab {tabSize}</span>
          <span>最后保存 {new Date(selectedNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {zoom}%</span>
        </>
      ) : (
        <>
          <span>{noteCount} 条笔记</span>
          <span>Kova v0.1.0 · {zoom}%</span>
        </>
      )}
    </div>
  );
}
