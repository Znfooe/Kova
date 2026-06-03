import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadQuickPinned, saveQuickPinned } from "./lib/theme";
import "./quick.css";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

type Mode = "write" | "browse";
type FilterType = "all" | "uncategorized" | string;

function QuickNote() {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pinned, setPinned] = useState(loadQuickPinned);
  const [mode, setMode] = useState<Mode>("write");
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [viewNote, setViewNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isModified, setIsModified] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevPositions = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>("[data-note-id]");
    const oldPositions = prevPositions.current;
    const newPositions = new Map<string, number>();
    items.forEach((el) => { newPositions.set(el.dataset.noteId!, el.offsetTop); });
    items.forEach((el) => {
      const id = el.dataset.noteId!;
      const oldTop = oldPositions.get(id);
      const newTop = newPositions.get(id);
      if (oldTop !== undefined && newTop !== undefined && oldTop !== newTop) {
        const dy = oldTop - newTop;
        el.style.transform = `translateY(${dy}px)`;
        el.style.transition = "none";
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
          const cleanup = () => { el.style.transition = ""; el.style.transform = ""; el.removeEventListener("transitionend", cleanup); };
          el.addEventListener("transitionend", cleanup);
        });
      }
    });
    prevPositions.current = newPositions;
  }, [notes]);

  useEffect(() => {
    textareaRef.current?.focus();
    const win = getCurrentWindow();
    win.show();
    // Save window size on resize
    const unlisten = win.onResized(() => {
      invoke<[number, number]>("get_window_size").then(([w, h]) => {
        invoke("save_quick_window_size", { width: w, height: h });
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleEditContent = (value: string) => {
    if (!viewNote) return;
    setEditContent(value);
    setIsModified(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await invoke("update_note", { id: viewNote.id, content: value });
      const now = new Date().toISOString();
      const updated = { ...viewNote, content: value, updated_at: now };
      setViewNote(updated);
      setIsModified(false);
      emit("quick-note-saved");
    }, 800);
  };

  const loadNotes = async (folderFilter?: FilterType) => {
    const f = folderFilter ?? filter;
    let result: Note[];
    if (f === "all") {
      result = await invoke<Note[]>("get_notes", { search: null, folderId: null });
    } else if (f === "uncategorized") {
      result = await invoke<Note[]>("get_notes", { search: null, folderId: "" });
    } else {
      result = await invoke<Note[]>("get_notes", { search: null, folderId: f });
    }
    setNotes(result);
  };

  const loadFolders = async () => {
    const result = await invoke<Folder[]>("get_folders");
    setFolders(result);
  };

  const selectNote = (note: Note) => {
    setViewNote(note);
    setEditContent(note.content);
    setIsModified(false);
  };

  const handleToggleBrowse = async () => {
    if (mode === "write") {
      await Promise.all([loadNotes(), loadFolders()]);
      setMode("browse");
    } else {
      setMode("write");
      setViewNote(null);
      setIsModified(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleFilterChange = async (f: FilterType) => {
    setFilter(f);
    await loadNotes(f);
  };

  const handlePin = async () => {
    const win = getCurrentWindow();
    const next = !pinned;
    await win.setAlwaysOnTop(next);
    setPinned(next);
    saveQuickPinned(next);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    try {
      const saved = await invoke<Note>("create_note", {
        title: "",
        content: content.trim(),
        noteType: "note",
        tags: [],
        dueDate: null,
      });
      setContent("");
      setStatus("saved");
      emit("quick-note-saved");
      selectNote(saved);
      setMode("browse");
      setTimeout(() => setStatus("idle"), 300);
    } catch (e) {
      console.error("Save failed:", e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      if (viewNote) {
        setViewNote(null);
        setIsModified(false);
      } else {
        getCurrentWindow().close();
      }
    }
  };

  return (
    <div className="quick-note" onKeyDown={handleKeyDown}>
      <div data-tauri-drag-region className="titlebar">
        <span className="title">便签</span>
        <div className="titlebar-btns">
          {viewNote ? (
            <button type="button" onClick={async () => { setViewNote(null); setIsModified(false); await loadNotes(); }} className="back-btn" title="返回">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
          ) : (
            <button type="button" onClick={handleToggleBrowse} className={`browse-btn ${mode === "browse" ? "active" : ""}`} title={mode === "browse" ? "返回编辑" : "查看笔记"}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </button>
          )}
          <button type="button" onClick={handlePin} className={`pin-btn ${pinned ? "pinned" : ""}`} title={pinned ? "取消置顶" : "置顶窗口"}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>
            </svg>
          </button>
          <button type="button" onClick={() => getCurrentWindow().close()} className="close-btn">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>
      </div>

      {/* Browse mode - note list */}
      {mode === "browse" && !viewNote && (
        <>
          <div className="folder-filter"
            onWheel={(e) => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }}
            onMouseDown={(e) => {
              const el = e.currentTarget;
              const startX = e.clientX + el.scrollLeft;
              const onMove = (ev: MouseEvent) => { el.scrollLeft = startX - ev.clientX; };
              const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}>
            <button type="button" className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => handleFilterChange("all")}>全部</button>
            <button type="button" className={`filter-chip ${filter === "uncategorized" ? "active" : ""}`} onClick={() => handleFilterChange("uncategorized")}>未分类</button>
            {folders.map((f) => (
              <button key={f.id} type="button" className={`filter-chip ${filter === f.id ? "active" : ""}`} onClick={() => handleFilterChange(f.id)}>{f.name}</button>
            ))}
          </div>
          <div ref={listRef} className="note-list">
          {notes.length === 0 ? (
            <div className="empty-hint">暂无笔记</div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                data-note-id={note.id}
                type="button"
                className="note-item"
                onClick={() => selectNote(note)}
              >
                <div className="note-item-row">
                  <span className="note-item-title">{note.title || note.content.split("\n")[0] || "无标题"}</span>
                  <span className="note-time">
                    {new Date(note.updated_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                    {" "}
                    {new Date(note.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </button>
            ))
          )}
          </div>
        </>
      )}

      {/* Browse mode - view/edit single note */}
      {mode === "browse" && viewNote && (
        <>
          <textarea
            value={editContent}
            onChange={(e) => handleEditContent(e.target.value)}
            className="note-view-editor"
            placeholder="写点什么..."
          />
          <div className="note-status">
            {new Date(viewNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {isModified ? <span className="text-unsaved">未保存</span> : <span className="text-saved">已保存</span>}
          </div>
        </>
      )}

      {/* Write mode */}
      {mode === "write" && (
        <>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写点什么..."
            className="editor"
          />
          <div className="footer">
            <span className="hint">Ctrl+Enter 保存 · Esc 关闭</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!content.trim()}
              className={`save-btn ${status === "error" ? "save-error" : ""}`}
            >
              {status === "saved" ? "已保存" : status === "error" ? "失败" : "保存"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<QuickNote />);
