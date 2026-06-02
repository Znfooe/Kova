import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { db } from "../../lib/db";
import type { Note, Folder } from "../../lib/db";
import { SearchBar } from "../shared/SearchBar";
import { NoteList } from "../shared/NoteList";
import { ContextMenu, type ContextMenuItem } from "../dialog/ContextMenu";
import { ConfirmDialog } from "../dialog/ConfirmDialog";

interface SidebarProps {
  search: string;
  filteredNotes: Note[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  folders: Folder[];
  selectedFolderId: string | null;
  onSearchChange: (value: string) => void;
  onSelectNote: (note: Note) => void;
  onCreateNote: (folderId?: string) => void;
  onDelete: (id: string) => void;
  onFolderSelect: (folderId: string | null) => void;
  onFolderCreate: (name: string, parentId?: string) => void;
  onFolderRename: (id: string, name: string) => void;
  onFolderDelete: (id: string) => Promise<void>;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  onMoveMultipleToFolder: (noteIds: string[], folderId: string | undefined) => void;
  onDeselectNote: (noteId: string) => void;
  onImported: () => void;
}

interface FolderNode extends Folder {
  children: FolderNode[];
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function FolderItem({ node, depth, selectedFolderId, selectedFolderIds, renamingFolderId, expandedFolderIds, onSelect, onSelectedIdsChange, onDeselectFolder, onRename, onRenameEnd, onDelete, onCreateSub, onDrop, onContextMenu }: {
  node: FolderNode; depth: number; selectedFolderId: string | null;
  selectedFolderIds: Set<string>;
  renamingFolderId: string | null;
  expandedFolderIds: Set<string>;
  onSelect: (id: string | null) => void; onSelectedIdsChange: (ids: Set<string>) => void;
  onDeselectFolder: (folderId: string) => void;
  onRename: (id: string, name: string) => void;
  onRenameEnd: () => void;
  onDelete: (id: string) => void; onCreateSub: (parentId: string) => void;
  onDrop: (noteId: string, folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FolderNode) => void;
}) {
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

export function Sidebar({
  search, filteredNotes, selectedId, selectedIds, onSelectedIdsChange,
  folders, selectedFolderId,
  onSearchChange, onSelectNote, onCreateNote, onDelete,
  onFolderSelect, onFolderCreate, onFolderRename, onFolderDelete, onMoveToFolder, onMoveMultipleToFolder, onDeselectNote, onImported,
}: SidebarProps) {
  const folderTree = buildTree(folders);
  const allFolderIds = folders.map(f => f.id);

  const [allExpanded, setAllExpanded] = useState(false);
  const allClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [folderMenuPos, setFolderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [folderMenuNode, setFolderMenuNode] = useState<FolderNode | null>(null);
  const [folderConfirm, setFolderConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [folderInfoNode, setFolderInfoNode] = useState<FolderNode | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [allMenuPos, setAllMenuPos] = useState<{ x: number; y: number } | null>(null);

  // On mount, expand the path to the last selected note's folder
  useEffect(() => {
    const lastFolderId = localStorage.getItem("fp-last-folder-id");
    if (!lastFolderId || folders.length === 0) return;
    const path = new Set<string>();
    let current = folders.find(f => f.id === lastFolderId);
    while (current) {
      path.add(current.id);
      current = current.parent_id ? folders.find(f => f.id === current!.parent_id) : undefined;
    }
    if (path.size > 0) {
      setExpandedFolderIds(path);
      setAllExpanded(true);
    }
  }, [folders]);

  const handleFolderContextMenu = (e: React.MouseEvent, node: FolderNode) => {
    // Include selectedFolderId in the effective set
    const effectiveIds = new Set(selectedFolderIds);
    if (selectedFolderId) effectiveIds.add(selectedFolderId);
    if (!effectiveIds.has(node.id)) {
      setSelectedFolderIds(new Set([node.id]));
    } else if (effectiveIds.size !== selectedFolderIds.size || selectedFolderId && !selectedFolderIds.has(selectedFolderId)) {
      setSelectedFolderIds(effectiveIds);
    }
    setFolderMenuPos({ x: e.clientX, y: e.clientY });
    setFolderMenuNode(node);
  };

  const handleDeselectFolder = (folderId: string) => {
    const next = new Set(selectedFolderIds);
    next.delete(folderId);
    setSelectedFolderIds(next);
    if (next.size > 0) {
      onFolderSelect([...next][0]);
    } else {
      onFolderSelect(null);
    }
  };

  const closeFolderMenu = () => {
    setFolderMenuPos(null);
    setFolderMenuNode(null);
  };

  const handleDeleteSelected = () => {
    const effectiveIds = new Set(selectedFolderIds);
    if (selectedFolderId) effectiveIds.add(selectedFolderId);
    if (effectiveIds.size === 0) effectiveIds.add(folderMenuNode!.id);
    const ids = [...effectiveIds];
    if (ids.length === 0) return;
    const names = ids.map(id => folders.find(f => f.id === id)?.name ?? id);
    setFolderConfirm({
      title: `删除 ${ids.length} 个文件夹`,
      message: `确定删除「${names.join("、")}」吗？其中的笔记将移至未分类。`,
      onConfirm: async () => {
        for (const id of ids) {
          await onFolderDelete(id);
        }
        setSelectedFolderIds(new Set());
        setFolderConfirm(null);
      },
    });
  };

  const handleExportFolder = async () => {
    if (!folderMenuNode) return;
    const notes = await db.list(undefined, folderMenuNode.id);
    if (notes.length === 0) {
      setFolderConfirm({ title: "导出文件夹", message: "该文件夹下没有笔记。", onConfirm: () => setFolderConfirm(null) });
      return;
    }
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const paths: string[] = [];
    for (const note of notes) {
      const path = await db.exportNote(note.id, destDir as string);
      paths.push(path);
    }
    setFolderConfirm({ title: "导出成功", message: `已导出 ${paths.length} 条笔记到：\n${destDir}`, onConfirm: () => setFolderConfirm(null) });
  };

  const getFolderMenuItems = (): ContextMenuItem[] => {
    const effectiveIds = new Set(selectedFolderIds);
    if (selectedFolderId) effectiveIds.add(selectedFolderId);
    const count = effectiveIds.size;
    return [
      {
        label: "查看详情",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
        onClick: () => { if (folderMenuNode) setFolderInfoNode(folderMenuNode); },
      },
      {
        label: "重命名",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
        onClick: () => { if (folderMenuNode) setRenamingFolderId(folderMenuNode.id); },
      },
      {
        label: "新建笔记",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
        onClick: () => { if (folderMenuNode) onCreateNote(folderMenuNode.id); },
      },
      {
        label: "新建子文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/><path d="M8 7v5M5.5 9.5h5" strokeWidth="1.1"/></svg>,
        onClick: () => { if (folderMenuNode) onFolderCreate("新建子文件夹", folderMenuNode.id); },
      },
      {
        label: "导出文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
        onClick: handleExportFolder,
      },
      {
        label: count > 1 ? `删除（${count} 个）` : "删除",
        danger: true,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
        onClick: handleDeleteSelected,
      },
    ];
  };

  const handleExportAll = async () => {
    const allNotes = await db.list();
    if (allNotes.length === 0) {
      setFolderConfirm({ title: "导出全部", message: "没有可导出的笔记。", onConfirm: () => setFolderConfirm(null) });
      return;
    }
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const paths: string[] = [];
    for (const note of allNotes) {
      const path = await db.exportNote(note.id, destDir as string);
      paths.push(path);
    }
    setFolderConfirm({ title: "导出成功", message: `已导出 ${paths.length} 条笔记到：\n${destDir}`, onConfirm: () => setFolderConfirm(null) });
  };

  const toggleAllFoldersExpand = () => {
    if (allExpanded) {
      setAllExpanded(false);
      setExpandedFolderIds(new Set());
    } else {
      setAllExpanded(true);
      setExpandedFolderIds(new Set(folders.map(f => f.id)));
    }
  };

  const getAllMenuItems = (): ContextMenuItem[] => [
    {
      label: "新建文件夹",
      icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
      onClick: () => onFolderCreate("新建文件夹"),
    },
    {
      label: "导出全部笔记",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
      onClick: handleExportAll,
    },
    {
      label: allExpanded ? "全部折叠" : "全部展开",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{allExpanded ? <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></> : <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>}</svg>,
      onClick: toggleAllFoldersExpand,
    },
  ];

  const handleImport = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "文档", extensions: ["md", "txt"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      await db.importMd(path);
    }
    onImported();
  };

  return (
    <div className="w-full h-full flex flex-col border-r border-paper-deep/30 bg-paper/40">
      <SearchBar value={search} onChange={onSearchChange} />

      {/* Folder list + Note list in one scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]" onDragOver={(e) => e.preventDefault()}>
        {/* Folder section */}
        {/* "未分类" standalone row */}
        <div className="px-2 pt-3 pb-1.5 flex items-center justify-between shrink-0">
          <button type="button" onClick={() => { setSelectedFolderIds(new Set()); onFolderSelect(""); }}
            className={`flex-1 text-left text-xs px-3 py-1 rounded transition-colors ${selectedFolderId === "" ? "text-accent font-medium" : "text-ink-soft hover:bg-paper-warm hover:text-accent"}`}>
            未分类
          </button>
        </div>
        {/* "全部" collapsible row with actions */}
        <div className="px-2 pb-1.5 flex items-center justify-between shrink-0"
          onContextMenu={(e) => { e.preventDefault(); setAllMenuPos({ x: e.clientX, y: e.clientY }); }}>
          <div className={`flex-1 flex items-center text-left text-xs px-3 py-1 rounded transition-colors ${selectedFolderId === null ? "text-accent font-medium" : "text-ink-soft hover:bg-paper-warm hover:text-accent"}`}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setAllExpanded(!allExpanded); }}
              className="w-4 h-4 flex items-center justify-center shrink-0 mr-1 cursor-pointer">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${allExpanded ? "rotate-90" : ""}`}><path d="M2 1l4 3-4 3z"/></svg>
            </button>
            <button type="button"
              onClick={() => {
                if (allClickTimer.current) { clearTimeout(allClickTimer.current); allClickTimer.current = null; }
                allClickTimer.current = setTimeout(() => { setSelectedFolderIds(new Set()); onFolderSelect(null); }, 250);
              }}
              onDoubleClick={() => { if (allClickTimer.current) { clearTimeout(allClickTimer.current); allClickTimer.current = null; } setAllExpanded(!allExpanded); }}
              className="flex-1 text-left cursor-pointer">
              全部
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const effectiveSize = selectedFolderIds.size + (selectedFolderId && !selectedFolderIds.has(selectedFolderId) ? 1 : 0);
                if (effectiveSize === allFolderIds.length && allFolderIds.length > 0) {
                  setSelectedFolderIds(new Set());
                  if (selectedFolderId) onFolderSelect(null);
                } else {
                  setSelectedFolderIds(new Set(allFolderIds));
                }
              }}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${selectedFolderIds.size > 0 ? "text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
              title={selectedFolderIds.size === allFolderIds.length ? "取消全选" : "全选"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill={selectedFolderIds.size > 0 ? "currentColor" : "none"} fillOpacity={selectedFolderIds.size > 0 ? 0.15 : 0}/>
                {selectedFolderIds.size === allFolderIds.length && allFolderIds.length > 0 && (
                  <path d="M4.5 7L6.5 9L9.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {selectedFolderIds.size > 0 && selectedFolderIds.size < allFolderIds.length && (
                  <path d="M4 7H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                )}
              </svg>
            </button>
            <button type="button" onClick={() => onFolderCreate("新建文件夹")}
              className="w-6 h-6 rounded-md flex items-center justify-center transition-colors text-ink-ghost hover:text-accent hover:bg-accent-mist"
              title="新建文件夹">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className={`px-2 pb-2 ${allExpanded ? "" : "hidden"}`}>
          {folderTree.map(node => (
            <FolderItem key={node.id} node={node} depth={0} selectedFolderId={selectedFolderId}
              selectedFolderIds={selectedFolderIds} renamingFolderId={renamingFolderId} expandedFolderIds={expandedFolderIds}
              onSelect={onFolderSelect} onSelectedIdsChange={setSelectedFolderIds}
              onDeselectFolder={handleDeselectFolder}
              onRename={onFolderRename} onRenameEnd={() => setRenamingFolderId(null)}
              onDelete={onFolderDelete}
              onCreateSub={(parentId) => onFolderCreate("新建子文件夹", parentId)}
              onDrop={onMoveToFolder} onContextMenu={handleFolderContextMenu} />
          ))}
        </div>
        <div className="h-px bg-paper-deep/30 mx-3 shrink-0" />

        {/* Note list */}
        <div className="px-5 pt-3 pb-1.5 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink-soft">{filteredNotes.length} 条笔记</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const effectiveSize = selectedIds.size + (selectedId && !selectedIds.has(selectedId) ? 1 : 0);
                if (effectiveSize === filteredNotes.length && filteredNotes.length > 0) {
                  onSelectedIdsChange(new Set());
                } else {
                  onSelectedIdsChange(new Set(filteredNotes.map(n => n.id)));
                }
              }}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${selectedIds.size > 0 ? "text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
              title={selectedIds.size === filteredNotes.length ? "取消全选" : "全选"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill={selectedIds.size > 0 ? "currentColor" : "none"} fillOpacity={selectedIds.size > 0 ? 0.15 : 0}/>
                {selectedIds.size === filteredNotes.length && filteredNotes.length > 0 && (
                  <path d="M4.5 7L6.5 9L9.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {selectedIds.size > 0 && selectedIds.size < filteredNotes.length && (
                  <path d="M4 7H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                )}
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onCreateNote()}
              className="w-6 h-6 rounded-md flex items-center justify-center transition-colors text-ink-ghost hover:text-accent hover:bg-accent-mist"
              title="新建笔记">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <NoteList notes={filteredNotes} selectedId={selectedId} selectedIds={selectedIds} onSelectedIdsChange={onSelectedIdsChange} onSelect={onSelectNote} onDeselect={onDeselectNote} onDelete={onDelete} folders={folders} onMoveMultipleToFolder={onMoveMultipleToFolder} />
      </div>

      {/* Import button */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <button type="button" onClick={handleImport}
          className="w-full h-9 rounded-lg bg-paper-warm/45 border border-paper-deep/25 text-xs text-ink-soft hover:border-accent/30 hover:text-accent transition-colors flex items-center px-3 gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导入笔记
        </button>
      </div>

      {/* Folder context menu */}
      {folderMenuPos && folderMenuNode && (
        <ContextMenu x={folderMenuPos.x} y={folderMenuPos.y} items={getFolderMenuItems()} onClose={closeFolderMenu} />
      )}

      {/* "全部" context menu */}
      {allMenuPos && (
        <ContextMenu x={allMenuPos.x} y={allMenuPos.y} items={getAllMenuItems()} onClose={() => setAllMenuPos(null)} />
      )}

      {/* Folder delete confirm */}
      {folderConfirm && (
        <ConfirmDialog
          title={folderConfirm.title}
          message={folderConfirm.message}
          danger
          confirmLabel="删除"
          onConfirm={folderConfirm.onConfirm}
          onCancel={() => setFolderConfirm(null)}
        />
      )}

      {/* Folder info dialog */}
      {folderInfoNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setFolderInfoNode(null)}>
          <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl w-[300px] animate-view-fade"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between h-10 px-4 border-b border-paper-deep/25">
              <h3 className="text-[13px] font-medium text-ink-soft">文件夹详情</h3>
              <button type="button" onClick={() => setFolderInfoNode(null)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-3 text-xs">
                <span className="text-ink-faint w-16 shrink-0 text-right">名称</span>
                <span className="text-ink-soft break-all">{folderInfoNode.name}</span>
              </div>
              {folderInfoNode.parent_id && (
                <div className="flex items-start gap-3 text-xs">
                  <span className="text-ink-faint w-16 shrink-0 text-right">父文件夹</span>
                  <span className="text-ink-soft">{folders.find(f => f.id === folderInfoNode.parent_id)?.name ?? "未知"}</span>
                </div>
              )}
              <div className="flex items-start gap-3 text-xs">
                <span className="text-ink-faint w-16 shrink-0 text-right">子文件夹</span>
                <span className="text-ink-soft">{folderInfoNode.children.length} 个</span>
              </div>
              <div className="flex items-start gap-3 text-xs">
                <span className="text-ink-faint w-16 shrink-0 text-right">创建时间</span>
                <span className="text-ink-soft">{new Date(folderInfoNode.created_at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t border-paper-deep/25 flex justify-end">
              <button type="button" onClick={() => setFolderInfoNode(null)}
                className="px-4 py-1.5 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors">
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
