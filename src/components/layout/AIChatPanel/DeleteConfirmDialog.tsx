import { useDraggable } from "../../../hooks/useDraggable";

interface DeleteConfirmDialogProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ title, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const drag = useDraggable();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl p-4 w-[280px] animate-view-fade cursor-move"
        style={{ transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)` }}
        onMouseDown={drag.onMouseDown}
        onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-ink-soft mb-3">{title}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded hover:bg-paper-warm transition-colors"
          >取消</button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1 text-xs text-white bg-danger rounded hover:opacity-90 transition-colors"
          >删除</button>
        </div>
      </div>
    </div>
  );
}
