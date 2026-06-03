import { useState, useRef, useLayoutEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { db } from "../../lib/db";
import type { Note } from "../../lib/db";
import { ContextMenu, type ContextMenuItem } from "../dialog/ContextMenu";
import { NoteProperties } from "../dialog/NoteProperties";
import { ConfirmDialog } from "../dialog/ConfirmDialog";
import { FolderPicker } from "../dialog/FolderPicker";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSelect: (note: Note) => void;
  onDeselect: (noteId: string) => void;
  onDelete: (id: string) => void;
  folders: { id: string; name: string; parent_id: string | null }[];
  onMoveMultipleToFolder: (noteIds: string[], folderId: string | undefined) => void;
}

export function NoteList({ notes, selectedId, selectedIds, onSelectedIdsChange, onSelect, onDeselect, onDelete, folders, onMoveMultipleToFolder }: NoteListProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const [propNote, setPropNote] = useState<Note | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; danger?: boolean;
    confirmLabel?: string; onConfirm: () => void; onCancel?: () => void;
  } | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [moveNoteIds, setMoveNoteIds] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevPositions = useRef<Map<string, number>>(new Map());
  const prevOrder = useRef<string[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>("[data-note-id]");
    const oldPositions = prevPositions.current;
    const newPositions = new Map<string, number>();

    items.forEach((el) => {
      const id = el.dataset.noteId!;
      newPositions.set(id, el.offsetTop);
    });

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
          const cleanup = () => {
            el.style.transition = "";
            el.style.transform = "";
            el.removeEventListener("transitionend", cleanup);
          };
          el.addEventListener("transitionend", cleanup);
        });
      }
    });

    prevPositions.current = newPositions;
    prevOrder.current = notes.map((n) => n.id);
  }, [notes]);

  const toggleSelect = (note: Note) => {
    const next = new Set(selectedIds);
    if (next.has(note.id)) {
      next.delete(note.id);
      onSelectedIdsChange(next);
    } else {
      // Can't deselect the last one
      const totalSelected = (selectedId ? 1 : 0) + next.size;
      if (totalSelected <= 1 && selectedId === note.id) return;
      next.add(note.id);
      onSelectedIdsChange(next);
      // If deselecting the currently editing note, switch to another
      if (selectedId === note.id) {
        onDeselect(note.id);
      }
    }
  };

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(note);
    } else {
      onSelectedIdsChange(new Set());
      onSelect(note);
    }
  };

  const handleMouseDown = (note: Note) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      toggleSelect(note);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    // Include selectedId (single-selected) in the multi-select set for context menu
    const effectiveIds = new Set(selectedIds);
    if (selectedId) effectiveIds.add(selectedId);
    // If right-clicked note is not in effective set, select only it
    if (!effectiveIds.has(note.id)) {
      onSelectedIdsChange(new Set([note.id]));
    } else if (effectiveIds.size !== selectedIds.size || selectedId && !selectedIds.has(selectedId)) {
      // Sync selectedId into selectedIds if not already there
      onSelectedIdsChange(effectiveIds);
    }
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuNote(note);
  };

  const closeMenu = () => {
    setMenuPos(null);
    setMenuNote(null);
  };

  const handleExportSelected = async (format: "md" | "html" | "txt" = "md") => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : (menuNote ? [menuNote.id] : []);
    if (ids.length === 0) return;
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const exportFn = format === "html" ? db.exportNoteHtml : format === "txt" ? db.exportNoteTxt : db.exportNote;
    const paths: string[] = [];
    for (const id of ids) {
      const path = await exportFn(id, destDir as string);
      paths.push(path);
    }
    setConfirmState({
      title: "导出成功",
      message: `已导出 ${paths.length} 条笔记到：\n${destDir}`,
      confirmLabel: "确定",
      onConfirm: () => setConfirmState(null),
    });
  };

  const handleDeleteSelected = (menuNote: Note) => {
    const effectiveIds = new Set(selectedIds);
    if (selectedId) effectiveIds.add(selectedId);
    if (effectiveIds.size === 0) effectiveIds.add(menuNote.id);
    const ids = [...effectiveIds];
    const count = ids.length;
    setConfirmState({
      title: count > 1 ? `删除 ${count} 条笔记` : "确认删除",
      message: count > 1
        ? `确定删除选中的 ${count} 条笔记吗？`
        : `确定删除「${menuNote.title || "无标题笔记"}」吗？`,
      danger: true,
      confirmLabel: "删除",
      onConfirm: () => { ids.forEach(id => onDelete(id)); setConfirmState(null); },
    });
  };

  const handleMoveToFolder = (note: Note) => {
    const effectiveIds = new Set(selectedIds);
    if (selectedId) effectiveIds.add(selectedId);
    if (effectiveIds.size === 0) effectiveIds.add(note.id);
    setMoveNoteIds([...effectiveIds]);
    setShowFolderPicker(true);
  };

  const handleFolderPick = (folderId: string) => {
    const count = moveNoteIds.length;
    setConfirmState({
      title: count > 1 ? `移动 ${count} 条笔记` : "移动笔记",
      message: count > 1
        ? `确定将 ${count} 条笔记移动到「${folderId ? folders.find(f => f.id === folderId)?.name : "未分类"}」吗？`
        : `确定移动到「${folderId ? folders.find(f => f.id === folderId)?.name : "未分类"}」吗？`,
      confirmLabel: "移动",
      onConfirm: () => {
        onMoveMultipleToFolder(moveNoteIds, folderId || undefined);
        setMoveNoteIds([]);
        setShowFolderPicker(false);
        setConfirmState(null);
      },
      onCancel: () => {
        setConfirmState(null);
        // Folder picker stays open
      },
    });
  };

  const getMenuItems = (note: Note): ContextMenuItem[] => {
    const effectiveIds = new Set(selectedIds);
    if (selectedId) effectiveIds.add(selectedId);
    const count = effectiveIds.size;
    const items: ContextMenuItem[] = [
      {
        label: "查看详情",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
        onClick: () => setPropNote(note),
      },
      {
        label: "复制标题",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
        onClick: () => { navigator.clipboard.writeText(note.title || note.content.split("\n")[0]); },
      },
      {
        label: count > 1 ? `移动到文件夹（${count} 条）` : "移动到文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
        onClick: () => handleMoveToFolder(note),
      },
      {
        label: count > 1 ? `导出 Markdown（${count} 条）` : "导出 Markdown",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
        onClick: () => handleExportSelected("md"),
      },
      {
        label: count > 1 ? `导出 HTML（${count} 条）` : "导出 HTML",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
        onClick: () => handleExportSelected("html"),
      },
      {
        label: count > 1 ? `导出 TXT（${count} 条）` : "导出 TXT",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
        onClick: () => handleExportSelected("txt"),
      },
      {
        label: count > 1 ? `删除（${count} 条）` : "删除",
        danger: true,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
        onClick: () => handleDeleteSelected(note),
      },
    ];
    return items;
  };

  const isHighlighted = (note: Note) => selectedId === note.id || selectedIds.has(note.id);

  if (notes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col items-center justify-center h-full text-ink-ghost px-4">
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none" className="mb-2 opacity-30">
            <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16h16M16 24h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-xs text-center">暂无记录</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          {notes.map((note) => (
            <div
              key={note.id}
              data-note-id={note.id}
              role="button"
              tabIndex={0}
              draggable="true"
              onDragStart={(e) => {
                if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                e.dataTransfer.setData("text/plain", note.id);
                e.dataTransfer.setData("text/note-id", note.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => handleNoteClick(e, note)}
              onMouseDown={() => handleMouseDown(note)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={(e) => handleContextMenu(e, note)}
              className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors cursor-pointer group relative ${isHighlighted(note)
                  ? "bg-accent-mist/70"
                  : "bg-transparent hover:bg-paper-warm"
                }`}
            >
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-accent/60 transition-all ${isHighlighted(note) ? "h-5" : "h-0"
                }`} />

              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-relaxed truncate flex-1 text-ink-soft">
                  {note.title || note.content.split("\n")[0]}
                </p>
                {(() => {
                  const d = new Date(note.updated_at);
                  const isThisYear = d.getFullYear() === new Date().getFullYear();
                  const dateStr = isThisYear
                    ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
                    : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                  return <span className="text-[10px] text-ink-ghost shrink-0">{dateStr}</span>;
                })()}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-ink-ghost">
                  {new Date(note.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {(note.title + note.content).length} 字
                </span>
                {note.tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="text-[10px] px-1 py-0 rounded bg-accent-mist/50 text-accent/70">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {menuPos && menuNote && (
        <ContextMenu x={menuPos.x} y={menuPos.y} items={getMenuItems(menuNote)} onClose={closeMenu} />
      )}

      {propNote && <NoteProperties note={propNote} onClose={() => setPropNote(null)} />}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onCancel={() => { confirmState.onCancel?.(); setConfirmState(null); }}
        />
      )}

      {/* Folder picker dialog */}
      {showFolderPicker && (
        <FolderPicker
          folders={folders}
          onSelect={handleFolderPick}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </>
  );
}
