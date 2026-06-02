import { useDraggable } from "../../hooks/useDraggable";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, message,
  confirmLabel = "确定", cancelLabel = "取消", danger = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { offset, onMouseDown } = useDraggable();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div
        className="bg-cloud rounded-xl border border-paper-deep shadow-xl w-[320px] animate-view-fade"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center h-10 px-4 border-b border-paper-deep/25 cursor-move" onMouseDown={onMouseDown}>
          <h3 className="text-[13px] font-medium text-ink-soft select-none">{title}</h3>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs text-ink-soft leading-relaxed">{message}</p>
        </div>

        <div className="px-4 py-2.5 border-t border-paper-deep/25 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-1.5 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className={`px-4 py-1.5 text-xs rounded-lg transition-colors ${
              danger
                ? "text-white bg-danger hover:bg-danger/80"
                : "text-white bg-accent hover:bg-accent-light"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
