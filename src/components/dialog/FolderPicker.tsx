import { useState, useRef, useCallback } from "react";

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
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

function FolderItem({ node, depth, onSelect }: {
  node: FolderNode; depth: number;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-xs text-ink-soft hover:bg-paper-warm rounded transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
            className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""} cursor-pointer`}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            <path d="M2 1l4 3-4 3z"/>
          </svg>
        )}
        {!hasChildren && <span className="w-2 shrink-0" />}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && node.children.map(child => (
        <FolderItem key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

interface FolderPickerProps {
  folders: Folder[];
  onSelect: (folderId: string) => void;
  onClose: () => void;
  title?: string;
}

export function FolderPicker({ folders, onSelect, onClose, title = "移动到文件夹" }: FolderPickerProps) {
  const folderTree = buildTree(folders);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    const onMouseMove = (e: MouseEvent) => {
      if (dialogRef.current) {
        dialogRef.current.style.left = `${e.clientX - dragOffset.current.x}px`;
        dialogRef.current.style.top = `${e.clientY - dragOffset.current.y}px`;
        dialogRef.current.style.right = "auto";
        dialogRef.current.style.bottom = "auto";
      }
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bg-cloud rounded-xl border border-paper-deep shadow-xl animate-view-fade flex flex-col"
        style={{ width: 300, height: 400, position: "absolute" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable header */}
        <div
          className="flex items-center justify-between h-10 px-4 border-b border-paper-deep/25 shrink-0 cursor-move"
          onMouseDown={handleMouseDown}
        >
          <h3 className="text-[13px] font-medium text-ink-soft select-none">{title}</h3>
          <button type="button" onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-1 min-h-0">
          <button
            type="button"
            onClick={() => onSelect("")}
            className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-xs text-ink-soft hover:bg-paper-warm rounded transition-colors"
            style={{ paddingLeft: '8px' }}
          >
            <span className="w-2 shrink-0" />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="truncate">未分类</span>
          </button>
          {folderTree.map(node => (
            <FolderItem key={node.id} node={node} depth={0} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
