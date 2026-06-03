import type { Conversation } from "./types";

interface ConversationListProps {
  conversations: Conversation[];
  currentConvId: string | null;
  editingConvId: string | null;
  editingConvTitle: string;
  onSelect: (id: string) => void;
  onStartRename: (conv: Conversation) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onEditingTitleChange: (title: string) => void;
  onTogglePinned: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations,
  currentConvId,
  editingConvId,
  editingConvTitle,
  onSelect,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onEditingTitleChange,
  onTogglePinned,
  onExport,
  onDelete,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return <div className="px-3 py-2 text-xs text-ink-ghost">暂无对话</div>;
  }

  return (
    <>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${conv.id === currentConvId ? "bg-accent-mist/50 text-accent" : "text-ink-soft hover:bg-paper-warm"
            }`}
          onClick={() => { if (editingConvId !== conv.id) { onSelect(conv.id); } }}
        >
          {editingConvId === conv.id ? (
            <input
              type="text"
              value={editingConvTitle}
              onChange={(e) => onEditingTitleChange(e.target.value)}
              onBlur={onConfirmRename}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirmRename(); if (e.key === "Escape") onCancelRename(); }}
              className="flex-1 text-xs bg-transparent outline-none"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs truncate flex-1 flex items-center gap-1">
              {conv.pinned && <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" /></svg>}
              {conv.title}
            </span>
          )}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePinned(conv.id); }}
              className={`w-4 h-4 flex items-center justify-center ${conv.pinned ? "text-accent" : "text-ink-ghost hover:text-accent"}`}
              title={conv.pinned ? "取消置顶" : "置顶"}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill={conv.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" /></svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExport(conv.id); }}
              className="w-4 h-4 flex items-center justify-center text-ink-ghost hover:text-accent"
              title="导出对话"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStartRename(conv); }}
              className="w-4 h-4 flex items-center justify-center text-ink-ghost hover:text-accent"
              title="重命名"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="w-4 h-4 flex items-center justify-center text-ink-ghost hover:text-danger"
              title="删除"
            >
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
