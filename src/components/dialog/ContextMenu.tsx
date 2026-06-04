import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="fixed z-50 bg-cloud rounded-lg border border-paper-deep shadow-lg py-1 min-w-[140px]"
      style={{ top: y, left: x }}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2.5 ${
            item.disabled ? "text-ink-ghost/40 cursor-not-allowed" :
            item.danger ? "text-danger hover:bg-danger-bg" : "text-ink-soft hover:bg-paper-warm"
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
