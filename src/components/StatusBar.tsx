import type { Note } from "../lib/db";

interface StatusBarProps {
  selectedNote: Note | null;
  noteCount: number;
}

export function StatusBar({ selectedNote, noteCount }: StatusBarProps) {
  return (
    <div className="h-7 px-4 flex items-center justify-between text-[11px] text-ink-ghost border-t border-paper-deep/20 bg-paper/30 shrink-0">
      {selectedNote ? (
        <>
          <span>{(selectedNote.title + selectedNote.content).length} 字 · {selectedNote.tags.length > 0 ? selectedNote.tags.join(", ") : "无标签"}</span>
          <span>最后保存 {new Date(selectedNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        </>
      ) : (
        <>
          <span>{noteCount} 条笔记</span>
          <span>Kova v0.1.0</span>
        </>
      )}
    </div>
  );
}
