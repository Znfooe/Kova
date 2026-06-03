import type { Folder } from "../../../lib/db";
import type { FolderNode } from "./types";

interface FolderInfoDialogProps {
  node: FolderNode;
  folders: Folder[];
  onClose: () => void;
}

export function FolderInfoDialog({ node, folders, onClose }: FolderInfoDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl w-[300px] animate-view-fade"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between h-10 px-4 border-b border-paper-deep/25">
          <h3 className="text-[13px] font-medium text-ink-soft">文件夹详情</h3>
          <button type="button" onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-start gap-3 text-xs">
            <span className="text-ink-faint w-16 shrink-0 text-right">名称</span>
            <span className="text-ink-soft break-all">{node.name}</span>
          </div>
          {node.parent_id && (
            <div className="flex items-start gap-3 text-xs">
              <span className="text-ink-faint w-16 shrink-0 text-right">父文件夹</span>
              <span className="text-ink-soft">{folders.find(f => f.id === node.parent_id)?.name ?? "未知"}</span>
            </div>
          )}
          <div className="flex items-start gap-3 text-xs">
            <span className="text-ink-faint w-16 shrink-0 text-right">子文件夹</span>
            <span className="text-ink-soft">{node.children.length} 个</span>
          </div>
          <div className="flex items-start gap-3 text-xs">
            <span className="text-ink-faint w-16 shrink-0 text-right">创建时间</span>
            <span className="text-ink-soft">{new Date(node.created_at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-paper-deep/25 flex justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-1.5 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
