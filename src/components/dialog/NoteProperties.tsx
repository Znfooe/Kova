import type { Note } from "../../lib/db";
import { useDraggable } from "../../hooks/useDraggable";

interface NotePropertiesProps {
  note: Note;
  onClose: () => void;
}

export function NoteProperties({ note, onClose }: NotePropertiesProps) {
  const { offset, onMouseDown } = useDraggable();
  const charCount = (note.title + note.content).length;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl w-[340px] animate-view-fade"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between h-10 px-4 border-b border-paper-deep/25 cursor-move" onMouseDown={onMouseDown}>
          <h3 className="text-[13px] font-medium text-ink-soft">详细信息</h3>
          <button type="button" onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          {note.title && <Row label="标题" value={note.title} />}
          <Row label="字数" value={`${charCount} 字`} />
          <Row label="创建时间" value={formatDate(note.created_at)} />
          <Row label="修改时间" value={formatDate(note.updated_at)} />
          {note.tags.length > 0 && <Row label="标签" value={note.tags.join(", ")} />}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="text-ink-faint w-16 shrink-0 text-right">{label}</span>
      <span className="text-ink-soft break-all">{value}</span>
    </div>
  );
}
