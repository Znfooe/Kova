import { useState, useRef, useEffect } from "react";
import type { FolderNode } from "./types";

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  selectedFolderId: string | null;
  selectedFolderIds: Set<string>;
  renamingFolderId: string | null;
  expandedFolderIds: Set<string>;
  onSelect: (id: string | null) => void;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onDeselectFolder: (folderId: string) => void;
  onRename: (id: string, name: string) => void;
  onRenameEnd: () => void;
  onDelete: (id: string) => void;
  onCreateSub: (parentId: string) => void;
  onDrop: (noteId: string, folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FolderNode) => void;
}

export function FolderItem({ node, depth, selectedFolderId, selectedFolderIds, renamingFolderId, expandedFolderIds, onSelect, onSelectedIdsChange, onDeselectFolder, onRename, onRenameEnd, onDelete, onCreateSub, onDrop, onContextMenu }: FolderItemProps) {
  const [expanded, setExpanded] = useState(() => expandedFolderIds.has(node.id));
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);

  useEffect(() => {
    if (renamingFolderId === node.id) {
      setEditing(true);
      setEditName(node.name);
    }
  }, [renamingFolderId, node.id, node.name]);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const hasChildren = node.children.length > 0;

  const isHighlighted = selectedFolderId === node.id || selectedFolderIds.has(node.id);

  const toggleSelect = () => {
    const next = new Set(selectedFolderIds);
    if (next.has(node.id)) {
      const totalAfter = next.size - 1 + (selectedFolderId && !next.has(selectedFolderId) && selectedFolderId !== node.id ? 1 : 0);
      if (totalAfter < 1) return;
      next.delete(node.id);
      onSelectedIdsChange(next);
      if (selectedFolderId === node.id) {
        onDeselectFolder(node.id);
      }
    } else {
      next.add(node.id);
      onSelectedIdsChange(next);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect();
    } else {
      onSelectedIdsChange(new Set());
      if (selectedFolderId !== node.id) {
        onSelect(node.id);
      } else {
        setExpanded(!expanded);
      }
    }
  };

  const handleMouseDown = () => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      toggleSelect();
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center rounded transition-colors cursor-pointer ${isHighlighted ? "bg-accent-mist text-accent" : "text-ink-soft hover:bg-paper-warm"} ${dragOver ? "ring-1 ring-accent/50" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); const noteId = e.dataTransfer.getData("text/note-id"); if (noteId) onDrop(noteId, node.id); }}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-ink-ghost">
          {hasChildren ? (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${expanded ? "rotate-90" : ""}`}><path d="M2 1l4 3-4 3z"/></svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-paper-deep/40" />
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-1 shrink-0 text-ink-faint">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {editing ? (
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter" && editName.trim()) { onRename(node.id, editName.trim()); setEditing(false); onRenameEnd(); } if (e.key === "Escape") { setEditName(node.name); setEditing(false); onRenameEnd(); } }}
            onBlur={() => { if (editName.trim() && editName !== node.name) onRename(node.id, editName.trim()); setEditing(false); onRenameEnd(); }}
            className="flex-1 min-w-0 h-6 px-1 text-[11px] bg-transparent focus:outline-none"
            autoFocus />
        ) : (
          <span className="flex-1 min-w-0 px-1 py-1 text-[11px] truncate">{node.name}</span>
        )}
        <div className="invisible group-hover:visible flex items-center gap-0.5 pr-1 shrink-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); onCreateSub(node.id); }} title="新建子文件夹"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-accent transition-colors">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/><path d="M8 7v5M5.5 9.5h5" strokeWidth="1.1"/></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(node.name); }} title="重命名"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-accent transition-colors">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} title="删除"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-danger transition-colors">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setConfirmDelete(false)}>
          <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl p-4 w-[280px] animate-view-fade" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-ink-soft mb-3">确定删除文件夹「{node.name}」吗？其中的笔记将移至未分类。</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors">取消</button>
              <button type="button" onClick={() => { onDelete(node.id); setConfirmDelete(false); }}
                className="px-3 py-1 text-xs text-white bg-danger rounded-lg hover:opacity-90 transition-colors">删除</button>
            </div>
          </div>
        </div>
      )}
      {expanded && hasChildren && node.children.map(child => (
        <FolderItem key={child.id} node={child} depth={depth + 1} selectedFolderId={selectedFolderId}
          selectedFolderIds={selectedFolderIds} renamingFolderId={renamingFolderId} expandedFolderIds={expandedFolderIds}
          onSelect={onSelect} onSelectedIdsChange={onSelectedIdsChange}
          onDeselectFolder={onDeselectFolder}
          onRename={onRename} onRenameEnd={onRenameEnd} onDelete={onDelete} onCreateSub={onCreateSub} onDrop={onDrop} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}
