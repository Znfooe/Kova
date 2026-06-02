import { useState, useCallback, useRef, useEffect } from "react";
import type { Note } from "../../lib/db";
import { loadAutoSave, loadAutoSaveDelay, loadTabSize, loadViewMode, saveViewMode, loadSplitRatio, saveSplitRatio } from "../../lib/theme";
import { MarkdownPreview } from "../shared/MarkdownPreview";
import { SlidingButtonGroup } from "../shared/SlidingButtonGroup";
import { FormatToolbar } from "../shared/FormatToolbar";
import { ConfirmDialog } from "../dialog/ConfirmDialog";

type ViewMode = "edit" | "split" | "preview";

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "edit", label: "编辑" },
  { value: "split", label: "分栏" },
  { value: "preview", label: "预览" },
];

interface NoteDetailProps {
  note: Note | null;
  onToggleSidebar: () => void;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateContent: (id: string, content: string) => void;
}

export function NoteDetail({ note, onToggleSidebar, onDelete, onUpdateTitle, onUpdateContent }: NoteDetailProps) {
  const [mode, setMode] = useState<ViewMode>(() => loadViewMode() as ViewMode);
  const [editTitle, setEditTitle] = useState(note?.title ?? "");
  const [editContent, setEditContent] = useState(note?.content ?? "");
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNoteIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Read settings directly from localStorage for real-time updates
  const getAutoSave = () => loadAutoSave();
  const getAutoSaveDelay = () => loadAutoSaveDelay();
  const getTabSize = () => loadTabSize();

  const handleEditorScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight || 1);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  }, []);

  // Sync when note changes
  useEffect(() => {
    if (note && note.id !== prevNoteIdRef.current) {
      prevNoteIdRef.current = note.id;
      setEditTitle(note.title);
      setEditContent(note.content);
      historyRef.current = [];
      setCanUndo(false);
    }
  }, [note]);

  // Persist view mode and split ratio
  useEffect(() => { saveViewMode(mode); }, [mode]);
  useEffect(() => { saveSplitRatio(splitRatio); }, [splitRatio]);

  // Listen for settings changes from SettingsPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      if (key === "view-mode") setMode(value as ViewMode);
      if (key === "split-ratio") setSplitRatio(value);
    };
    window.addEventListener("fp-settings-changed", handler);
    return () => window.removeEventListener("fp-settings-changed", handler);
  }, []);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMouseMove = (e: MouseEvent) => {
      const ratio = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.min(80, Math.max(20, ratio)));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleTitleChange = useCallback((value: string) => {
    setEditTitle(value);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (getAutoSave()) {
      titleTimerRef.current = setTimeout(() => {
        if (note) onUpdateTitle(note.id, value);
      }, getAutoSaveDelay());
    }
  }, [note, onUpdateTitle]);

  const handleContentChange = useCallback((value: string) => {
    historyRef.current.push(editContent);
    if (historyRef.current.length > 50) historyRef.current.shift();
    setCanUndo(true);
    setEditContent(value);
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    if (getAutoSave()) {
      contentTimerRef.current = setTimeout(() => {
        if (note) onUpdateContent(note.id, value);
      }, getAutoSaveDelay());
    }
  }, [note, editContent, onUpdateContent]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev !== undefined) {
      setEditContent(prev);
      setCanUndo(historyRef.current.length > 0);
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
      contentTimerRef.current = setTimeout(() => {
        if (note) onUpdateContent(note.id, prev);
      }, 800);
    }
  }, [note, onUpdateContent]);

  const handleSave = useCallback(() => {
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    if (note) {
      if (editTitle !== note.title) onUpdateTitle(note.id, editTitle);
      if (editContent !== note.content) onUpdateContent(note.id, editContent);
    }
  }, [note, editTitle, editContent, onUpdateTitle, onUpdateContent]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleUndo]);

  if (!note) {
    return (
      <>
        <div className="flex items-center justify-between px-4 h-10 border-b border-paper-deep/20 shrink-0 bg-paper/20">
          <span className="text-xs text-ink-ghost">选择一条笔记查看</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-ink-ghost">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="mb-3 opacity-20">
            <rect x="10" y="7" width="36" height="42" rx="5" stroke="currentColor" strokeWidth="2"/>
            <path d="M19 18h18M19 26h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p className="text-sm">Kova</p>
          <p className="text-xs mt-1">灵感来了，记一笔</p>
        </div>
      </>
    );
  }

  const isModified = editContent !== note.content || editTitle !== note.title;

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-paper-deep/20 shrink-0 bg-paper/20">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleSidebar} className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-faint hover:bg-paper-warm transition-all cursor-pointer" title="切换侧边栏">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
          <div className="h-4 w-px bg-paper-deep/30 mx-0.5" />
          <button type="button" onClick={handleUndo} disabled={!canUndo}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
              !canUndo ? "text-ink-ghost/30" : "text-ink-ghost hover:text-ink-faint hover:bg-paper-warm"
            }`} title="撤销 (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>
          <div className="h-4 w-px bg-paper-deep/30 mx-0.5" />
          <button type="button" onClick={handleSave}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
              isModified ? "text-accent hover:bg-accent-mist" : "text-ink-ghost/30"
            }`} title="保存 (Ctrl+S)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
          <div className="h-4 w-px bg-paper-deep/30 mx-0.5" />
          <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-red-400 hover:bg-danger-bg transition-all cursor-pointer" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <SlidingButtonGroup options={VIEW_MODES} value={mode} onChange={setMode} buttonClassName="h-7 px-4" />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-4 pb-2 shrink-0 border-b border-paper-deep/15">
        <input type="text" value={editTitle} onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="标题（可选）"
          className="w-full text-[20px] font-bold text-ink bg-transparent focus:outline-none placeholder:text-ink-ghost" />
        <p className="text-[11px] text-ink-ghost mt-1">
          {new Date(note.updated_at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {isModified ? <span className="text-danger">未保存</span> : <span className="text-accent">已保存</span>}
        </p>
      </div>

      {/* Content Area */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {(mode === "edit" || mode === "split") && (
          <div className={`${mode === "split" ? "" : "flex-1"} flex flex-col min-h-0`} style={mode === "split" ? { width: `${splitRatio}%` } : undefined}>
            {mode === "split" && <div className="h-7 px-4 flex items-center border-b border-paper-deep/10 shrink-0"><span className="text-[10px] text-ink-ghost">编辑</span></div>}
            <FormatToolbar textareaRef={textareaRef} onChange={handleContentChange} />
            <textarea ref={textareaRef} value={editContent} onChange={(e) => handleContentChange(e.target.value)}
              onScroll={mode === "split" ? handleEditorScroll : undefined}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const tabSize = getTabSize();
                  const spaces = " ".repeat(tabSize);
                  const newValue = editContent.substring(0, start) + spaces + editContent.substring(end);
                  handleContentChange(newValue);
                  requestAnimationFrame(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + tabSize;
                    }
                  });
                }
              }}
              placeholder="支持 Markdown 语法..."
              className="flex-1 resize-none bg-transparent text-ink-soft px-6 py-4 focus:outline-none placeholder:text-ink-ghost font-mono editor-textarea"
              spellCheck={false} />
          </div>
        )}

        {mode === "split" && (
          <div
            className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors"
            onMouseDown={handleDividerMouseDown}
          />
        )}

        {(mode === "preview" || mode === "split") && (
          <div className={`${mode === "split" ? "" : "flex-1"} flex flex-col min-h-0`} style={mode === "split" ? { width: `${100 - splitRatio}%` } : undefined}>
            {mode === "split" && <div className="h-7 px-4 flex items-center border-b border-paper-deep/10 shrink-0"><span className="text-[10px] text-ink-ghost">预览</span></div>}
            <div ref={previewRef} className="flex-1 overflow-y-auto px-6 py-4">
              <MarkdownPreview content={mode === "split" ? editContent : note.content} />
            </div>
          </div>
        )}
      </div>

      {note.tags.length > 0 && (
        <div className="px-6 pb-3 pt-1 shrink-0 flex items-center gap-1.5 flex-wrap">
          {note.tags.map((tag) => <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-accent-mist text-accent">{tag}</span>)}
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="确认删除"
          message={`确定删除「${note.title || "无标题笔记"}」吗？`}
          danger
          confirmLabel="删除"
          onConfirm={() => { onDelete(note.id); setShowDeleteConfirm(false); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
