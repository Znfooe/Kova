import { useState, useCallback, useRef, useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import type { Note } from "../../lib/db";
import { loadAutoSave, loadAutoSaveDelay, loadViewMode, saveViewMode, loadSplitRatio, saveSplitRatio, loadTabSize } from "../../lib/theme";
import { MarkdownPreview } from "../shared/MarkdownPreview";
import { CodeEditor, insertAtCursor } from "../shared/CodeEditor";
import { FormatToolbar } from "../shared/FormatToolbar";
import { SlidingButtonGroup } from "../shared/SlidingButtonGroup";
import { ConfirmDialog } from "../dialog/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "../dialog/ContextMenu";

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNoteIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [tabSize, setTabSize] = useState(loadTabSize);
  const getAutoSave = () => loadAutoSave();
  const getAutoSaveDelay = () => loadAutoSaveDelay();

  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    const pv = previewRef.current;
    if (!pv) return;
    const ratio = scrollTop / (scrollHeight - clientHeight || 1);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  }, []);

  // Sync when note changes
  useEffect(() => {
    if (note && note.id !== prevNoteIdRef.current) {
      prevNoteIdRef.current = note.id;
      setEditTitle(note.title);
      setEditContent(note.content);
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
      if (key === "tab-size") setTabSize(value);
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
    setEditContent(value);
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    if (getAutoSave()) {
      contentTimerRef.current = setTimeout(() => {
        if (note) onUpdateContent(note.id, value);
      }, getAutoSaveDelay());
    }
  }, [note, onUpdateContent]);

  const handleUndo = useCallback(() => {
    const view = editorViewRef.current;
    if (view) undo(view);
  }, []);

  const handleRedo = useCallback(() => {
    const view = editorViewRef.current;
    if (view) redo(view);
  }, []);

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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const getEditorMenuItems = (): ContextMenuItem[] => {
    const view = editorViewRef.current;
    const hasSelection = view ? !view.state.selection.main.empty : false;
    return [
      { label: "撤销", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>, onClick: handleUndo },
      { label: "重做", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>, onClick: handleRedo },
      { label: "剪切", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>, onClick: () => document.execCommand("cut"), disabled: !hasSelection },
      { label: "复制", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, onClick: () => document.execCommand("copy") },
      { label: "粘贴", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>, onClick: async () => { const text = await navigator.clipboard.readText(); if (view) insertAtCursor(view, text); } },
      { label: "全选", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>, onClick: () => { if (view) { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); } } },
      { label: "插入代码块", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, onClick: () => { if (view) insertAtCursor(view, "\n```\n", "\n```\n"); } },
      { label: "插入表格", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>, onClick: () => { if (view) insertAtCursor(view, "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n"); } },
    ];
  };

  const getPreviewMenuItems = (): ContextMenuItem[] => [
    { label: "复制", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, onClick: () => document.execCommand("copy") },
    { label: "全选", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>, onClick: () => { const el = previewRef.current; if (el) { const range = document.createRange(); range.selectNodeContents(el); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); } } },
  ];

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
          <button type="button" onClick={handleUndo}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-faint hover:bg-paper-warm transition-all cursor-pointer" title="撤销 (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>
          <button type="button" onClick={handleRedo}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-faint hover:bg-paper-warm transition-all cursor-pointer" title="重做 (Ctrl+Shift+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
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
            <FormatToolbar editorViewRef={editorViewRef} />
            <CodeEditor
              value={editContent}
              onChange={handleContentChange}
              placeholder="支持 Markdown 语法..."
              className="flex-1 min-h-0"
              tabSize={tabSize}
              editorViewRef={editorViewRef}
              onScroll={mode === "split" ? handleEditorScroll : undefined}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, items: getEditorMenuItems() }); }}
            />
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
            <div ref={previewRef} className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:bg-paper-deep [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-ink-ghost [&::-webkit-scrollbar-track]:bg-transparent"
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, items: getPreviewMenuItems() }); }}>
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
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
